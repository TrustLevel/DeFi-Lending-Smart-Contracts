import { Data, Datum, RedeemerBuilder, stringify, UTxO } from "@lucid-evolution/lucid";
import {
    adaAssetClass,
    deployDetailsFile,
    formattedTime,
    getLucidInstance,
    logTimeNow,
    makeOracleDatum,
    ORACLE_DATA_VALIDITY,
    ORACLE_PRVDR1_SEED,
    OracleDatum,
    OracleDatumType,
    provider1PaymentHash,
    RedeemerEnum,
    tusdDeployed,
    UnifiedRedeemer,
    UnifiedRedeemerType,
    parseStringifiedUtxo,
    orderUtxosCanonically,
    getUpdatedPrice,
    getDeployedRefUtxos,
} from "../index.ts";

/**
 * Config: set `forceUpdate` to true to force submitting an oracle update tx
 * even when the previous update hasn't expired yet.
 */
const forceUpdate = false;





const dryRun = Deno.args[0] == "dryrun";

const lucid = getLucidInstance();
// Switch to provider wallet:
lucid.selectWallet.fromSeed(ORACLE_PRVDR1_SEED);

const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);
const refUtxos = getDeployedRefUtxos(Object.values(deployed.referenceUtxos));
const oracleBcnToken = deployed.oraclePriceBcnToken;
const oracleCfgUtxo: UTxO = parseStringifiedUtxo(deployed.cfgUtxos.oracleCfgUtxo);

let priceUtxo: UTxO;
let currDatum: OracleDatumType;
let updatedPrice: [bigint, bigint];
let updateRunning = false;

console.log(`${logTimeNow()} Starting oracle update price monitor.\n`);
let intervalId: number | undefined = undefined;
let intervalMs: number | undefined = undefined;
await oracleMonitor();

async function oracleMonitor() {
    if (updateRunning) {
        console.log(`${logTimeNow()} Previous update action still in progress. Skipping for now.`);
        return;
    }
    updateRunning = true;

    const oracleUtxos = dryRun 
        ? [parseStringifiedUtxo(deployed.oraclePriceUtxo)] 
        : await lucid.utxosAt(deployed.oracleScriptAddr);
    priceUtxo = oracleUtxos.find((utxo) => {
        if (utxo.assets[oracleBcnToken]) return true;
        else return false;
    })!;

    currDatum = Data.from(priceUtxo.datum!, OracleDatum);

    // check if data is due for updating:
    const valid_until = currDatum.timestamp + currDatum.validity_period;
    const threshold = valid_until - BigInt(120 * 1000); // 120 seconds prior to expiry
    if (forceUpdate || dryRun || threshold <= BigInt(Date.now())) {
        // run update:
        console.log(`${logTimeNow()} Oracle price datum is due for updating.`);
        console.log(`valid_until: ${formattedTime(valid_until)}`);
        console.log(`threshold:   ${formattedTime(threshold)}`);
        console.log(`time now:    ${formattedTime(Date.now())}`);
        console.log(`Will update now...`);
        updatedPrice = await getUpdatedPrice(lucid);
        await oracleUpdatePrice();
        console.log(`${logTimeNow()} Oracle price datum updated.`);
        console.log(`new price: ${stringify(updatedPrice)}`);
        console.log("");

        // schedule next update run:
        if (intervalId) clearInterval(intervalId);
        intervalMs = Number(ORACLE_DATA_VALIDITY) * 58 * 60 * 1000;
        intervalId = setInterval(async () => {
            await oracleMonitor();
        }, intervalMs);
    } else {
        // schedule next update run:
        const msTimeLeft = Number(threshold) - Date.now();
        console.log(
            `${logTimeNow()} Oracle price datum is not yet due for updating. Will update in ${msTimeLeft / 1000} seconds.`,
        );
        if (intervalId) clearInterval(intervalId);
        intervalMs = msTimeLeft;
        intervalId = setInterval(async () => {
            await oracleMonitor();
        }, intervalMs);
    }
    updateRunning = false;
    console.log(`Next check in ${intervalMs! / 1000} seconds...`);
    console.log("");
}



async function oracleUpdatePrice() {
    // new datum:
    const oraclePriceObj: OracleDatumType = {
        timestamp: BigInt(Date.now()),
        validity_period: BigInt(Number(ORACLE_DATA_VALIDITY) * 60 * 60 * 1000),
        quoted_asset: adaAssetClass,
        denomination: tusdDeployed,
        price: updatedPrice,
        consumers: [],
    };
    const oraclePriceDatum = makeOracleDatum(oraclePriceObj);

    const oracleContractRefUtxo = refUtxos.find((utxo) => {
        if (utxo.assets[deployed.refscriptsBcnTokens.oracle]) return true;
        else return false;
    })!;

    const referenceInputs = [oracleContractRefUtxo, oracleCfgUtxo];
    const refInputsIdxs = orderUtxosCanonically(referenceInputs);
    const cfg_idx = refInputsIdxs.get(oracleCfgUtxo.txHash + oracleCfgUtxo.outputIndex)!

    const oracleRedeemer: RedeemerBuilder = {
        kind: "selected",
        inputs: [priceUtxo],
        makeRedeemer: (inputIdxs: bigint[]) => {
            const redeemer: UnifiedRedeemerType = {
                [RedeemerEnum.UpdateOraclePrice]: {
                    price_idxs: [inputIdxs[0], 0n],
                    cfg_idx: cfg_idx,
                    provider: provider1PaymentHash,
                },
            };
            return Data.to(redeemer, UnifiedRedeemer);
        },
    };
    

    const [_newWalletInputs, derivedOutputs, tx] = await lucid
        .newTx()
        .collectFrom([priceUtxo], oracleRedeemer)
        .pay.ToContract(
            deployed.oracleScriptAddr,
            { kind: "inline", value: oraclePriceDatum as Datum },
            priceUtxo.assets,
        )
        .readFrom(referenceInputs)
        .addSignerKey(provider1PaymentHash)
        .chain();
    console.log(`Oracle price update tx built.`);

    const signedTx = await tx.sign.withWallet().complete();
    console.log(`signedTx: ${stringify(signedTx)}`);
    console.log(`signedTx hash: ${signedTx.toHash()}`);
    console.log(`size: ~${signedTx.toCBOR().length / 2048} KB`);

    console.log("");
    const txJson = JSON.parse(stringify(signedTx));
    console.log(`txFee: ${parseInt(txJson.body.fee) / 1_000_000} ADA`);
    console.log("");
    if (!dryRun){
        const txHash = await signedTx.submit();
        console.log(`tx submitted. Hash: ${txHash}`);
    } else {
        // Update deployed details file
        const oraclePriceUtxo: UTxO = derivedOutputs.find((utxo) => {
            if (utxo.assets[oracleBcnToken]) return true;
            else return false;
        }) as UTxO;
        
        deployed.oraclePriceUtxo = oraclePriceUtxo;
        const data = new TextEncoder().encode(stringify(deployed));
        Deno.writeFileSync(deployDetailsFile, data);
        console.log(`Updated ${deployDetailsFile}`);
    }
    console.log("");
}
