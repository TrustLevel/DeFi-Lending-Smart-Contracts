import { 
    UTxO,
    Data,
    stringify,
    RedeemerBuilder,
} from "@lucid-evolution/lucid";

import {
    deployDetailsFile,
    getLucidInstance,
    LendingPoolDatum,
    RedeemerEnum,
    RegistryDatum,
    UnifiedRedeemer,
    UnifiedRedeemerType,
    parseStringifiedUtxo,
    orderUtxosCanonically,
    ORACLE_PRVDR1_SEED,
    OracleDatum,
    provider1PaymentHash,
    makeAuditDatum,
    SettingsEnum,
    SettingsDatum,
    GlobalSettingsType,
    calcAssetValue,
} from "../index.ts";
import BigNumber from "bignumber.js";

const dryRun = Deno.args[0] == "dryrun";

const lucid = getLucidInstance();
// switch to oracle provider wallet
lucid.selectWallet.fromSeed(ORACLE_PRVDR1_SEED);

const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);

const {
    cfgUtxos,
    poolUtxo,
    auditUtxo,
    referenceUtxos,
    oraclePolicyID,
    oraclePriceUtxo,
    auditScriptAddr,
    oracleScriptAddr,
    settingsPolicyID,
    settingsBcnTokens,
    registryScriptAddr,
    lendingPoolScriptAddr,
} = deployed;

// gather relevant protocol utxos
const auditContractRefUtxo = parseStringifiedUtxo(referenceUtxos.audit);
const globalCfgUtxo = parseStringifiedUtxo(cfgUtxos.globalCfgUtxo);
const oracleCfgUtxo = parseStringifiedUtxo(cfgUtxos.oracleCfgUtxo);
const lendingPoolUtxo = dryRun 
    ? parseStringifiedUtxo(poolUtxo)
    : (await lucid.utxosAt(lendingPoolScriptAddr))[0];
const oracleUtxo = dryRun
    ? parseStringifiedUtxo(oraclePriceUtxo)
    : (await lucid.utxosAtWithUnit(oracleScriptAddr, `${oraclePolicyID}${settingsBcnTokens.oraclePrice}`))[0];
const positionUtxos = dryRun 
    ? (()=>{
        const utxos: UTxO[] = [];
        if (deployed.user1PosRegUtxo) utxos.push(parseStringifiedUtxo(deployed.user1PosRegUtxo));
        if (deployed.user2PosRegUtxo) utxos.push(parseStringifiedUtxo(deployed.user2PosRegUtxo));
        return utxos;
    })()
    : await lucid.utxosAt(registryScriptAddr);
const lastAuditUtxo = dryRun
    ? parseStringifiedUtxo(auditUtxo)
    : (await lucid.utxosAtWithUnit(auditScriptAddr, `${settingsPolicyID}${settingsBcnTokens.audit}`))[0];

// parse utxo datums
const poolDatum = Data.from(lendingPoolUtxo.datum!, LendingPoolDatum);
const oracleDatum = Data.from(oracleUtxo.datum!, OracleDatum);
const globalCfgDatum = (Data.from(globalCfgUtxo.datum!, SettingsDatum) as {[SettingsEnum.GlobalSettings]: GlobalSettingsType})[SettingsEnum.GlobalSettings];
const [totalLockedCollateral, totalBorrowed] = (()=>{
    return positionUtxos.reduce((acc: [bigint, bigint], utxo) => {
        const positionDatum = Data.from(utxo.datum!, RegistryDatum);
        const loan = positionDatum.loan;
        const collateralAmt = loan.collateral_amt;
        const totalCollateral = acc[0] + collateralAmt;
        const totalLoans = acc[1] + loan.borrowed_amt;
        return [totalCollateral, totalLoans];
    }, [0n, 0n])
})();
const totalCanBeBorrowed = (()=>{
    const valueRatio = BigNumber(globalCfgDatum.collateral_ratio.toString());
    const collateralVal = calcAssetValue(totalLockedCollateral, oracleDatum.price);
    const borrowableAmt = collateralVal.times(valueRatio).div(BigNumber(100));
    return BigInt(borrowableAmt.toString());
})();
const healthScore = [totalCanBeBorrowed, totalBorrowed] as [bigint, bigint];

// calculate total lp reserve
const totalLpReserve = (()=>{
    const reserveAsset = poolDatum.loanable_asset.policy_id + poolDatum.loanable_asset.asset_name;
    const available = lendingPoolUtxo.assets[reserveAsset];
    return available + totalBorrowed;
})();

const utilizationRate = [totalBorrowed, totalLpReserve] as [bigint, bigint];


// updated audit datum
const updatedAuditDatum = makeAuditDatum({
    timestamp: BigInt(Date.now()),
    collateral_asset: poolDatum.collateral_asset,
    loanable_asset: poolDatum.loanable_asset,
    collateral_ratio: globalCfgDatum.collateral_ratio,
    total_collateral: totalLockedCollateral,
    total_borrowed: totalBorrowed,
    health_score: healthScore,
    utilization_rate: utilizationRate,
});


// organize reference inputs
const referenceInputs = [
    auditContractRefUtxo,
    globalCfgUtxo,
    oracleCfgUtxo,
    lendingPoolUtxo,
    oracleUtxo
];
const refInputsIdxs = orderUtxosCanonically(referenceInputs);
const gcfg_idx = refInputsIdxs.get(globalCfgUtxo.txHash + globalCfgUtxo.outputIndex)!;
const ocfg_idx = refInputsIdxs.get(oracleCfgUtxo.txHash + oracleCfgUtxo.outputIndex)!;
const pool_idx = refInputsIdxs.get(lendingPoolUtxo.txHash + lendingPoolUtxo.outputIndex)!;
const oracle_idx = refInputsIdxs.get(oracleUtxo.txHash + oracleUtxo.outputIndex)!;

// audit utxo update redeemer
const updateAuditRedeemer: RedeemerBuilder = {
    kind: "selected",
    inputs: [lastAuditUtxo],
    makeRedeemer: (inputIdxs: bigint[]) => {
        const redeemer: UnifiedRedeemerType = {
            [RedeemerEnum.UpdateAuditDatum]: {
                audit_idxs: [inputIdxs[0], 0n],
                gcfg_idx: gcfg_idx,
                ocfg_idx: ocfg_idx,
                pool_idx: pool_idx,
                oracle_idx: oracle_idx,
                provider: provider1PaymentHash
            },
        };
        return Data.to(redeemer, UnifiedRedeemer);
    },
};

// tx validity range
const validFrom = Date.now() - (10 * 20 * 1000); // start lower bound 10 slots earlier to avoid demeter.run errors
const validTo = validFrom + (1000 * 60 * 60 * 1); // 1hr

// build tx
const [_newWalletInputs, derivedOutputs, tx] = await lucid
    .newTx()
    .collectFrom([lastAuditUtxo], updateAuditRedeemer)
    .pay.ToContract(
        auditScriptAddr,
        { kind: "inline", value: updatedAuditDatum },
        lastAuditUtxo.assets,
    )
    .validFrom(validFrom)
    .validTo(validTo)
    .attachMetadata(674, { msg: ["Audit update"] })
    .addSignerKey(provider1PaymentHash)
    .readFrom(referenceInputs)
    .chain();
console.log(`Audit update tx built`);
console.log("");
const signedTx = await tx.sign.withWallet().complete();
console.log(`signedTx: ${stringify(signedTx)}`);
console.log(`signedTx hash: ${signedTx.toHash()}`);
console.log(`size: ~${signedTx.toCBOR().length / 2048} KB`);
console.log("");
console.log("");
const txJson = JSON.parse(stringify(signedTx));
console.log(`txFee: ${parseInt(txJson.body.fee) / 1_000_000} ADA`);
console.log("");
if (!dryRun){
    const txHash = await signedTx.submit();
    console.log(`tx submitted. Hash: ${txHash}`);
}
console.log("");


// Update deployed details file
const updatedAuditUtxo: UTxO = derivedOutputs.find((utxo) => {
    if (utxo.address == auditScriptAddr) return true;
    else return false;  
}) as UTxO;
deployed.auditUtxo = updatedAuditUtxo;
const data = new TextEncoder().encode(stringify(deployed));
Deno.writeFileSync(deployDetailsFile, data);
console.log(`Updated ${deployDetailsFile}`);
console.log("");