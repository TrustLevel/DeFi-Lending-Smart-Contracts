import { 
    UTxO,
    Datum,
    stringify
} from "@lucid-evolution/lucid";
import {
    adaAssetClass,
    AssetClass,
    deployDetailsFile,
    getLoanableAssetAtAdminAddress,
    getLucidInstance,
    InterestRate,
    intRatesList,
    LendingPoolDatumType,
    makeLendingPoolDatum,
    tusdDeployed,
} from "../index.ts";

// config: lending_pool contract settings to be stored in utxo datum
// -------------------------------------------------------------------
const collateralAsset = adaAssetClass;
const interestRates = Object.entries(intRatesList)
    .map(([_label, entry]) => [entry.term, entry.rate] as InterestRate);
// -------------------------------------------------------------------

const dryRun = Deno.args[0] == "dryrun";

const lucid = getLucidInstance();

const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);

const { lendingPoolScriptAddr } = deployed;

const loanableAsset: AssetClass = deployed.loanableAsset ?? tusdDeployed;

const loanableAssetAmt = dryRun 
    ? 900_000_000_000n 
    : 9_000_000_000_000n; // await getLoanableAssetAtAdminAddress(loanableAsset);

const lpDatumObj: LendingPoolDatumType = {
    loanable_asset: loanableAsset,
    collateral_asset: collateralAsset,
    interest_rates: interestRates,
};
const lp_datum = makeLendingPoolDatum(lpDatumObj);

const [_newWalletInputs, derivedOutputs, tx] = await lucid
    .newTx()
    .pay.ToContract(
        lendingPoolScriptAddr,
        { kind: "inline", value: lp_datum as Datum },
        { [loanableAsset.policy_id + loanableAsset.asset_name]: loanableAssetAmt },
    )
    .chain();
console.log(`Liquidity deploy tx built.`);

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
}
console.log("");

// update deployDetailsFile
const poolUtxo: UTxO = derivedOutputs.find((utxo) => {
    if (utxo.address == lendingPoolScriptAddr) return true;
    else return false;
}) as UTxO;
deployed.poolUtxo = poolUtxo;
const data = new TextEncoder().encode(stringify(deployed));
Deno.writeFileSync(deployDetailsFile, data);
console.log(`Updated ${deployDetailsFile}`);
console.log("");
