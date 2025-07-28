import { Data, RedeemerBuilder, stringify, UTxO } from "@lucid-evolution/lucid";
import {
    adminPkh,
    AssetClass,
    deployDetailsFile,
    getLucidInstance,
    RedeemerEnum,
    tusdDeployed,
    UnifiedRedeemer,
    UnifiedRedeemerType,
    parseStringifiedUtxo,
    getDeployedRefUtxos,
    orderUtxosCanonically,
} from "../index.ts";

const dryRun = Deno.args[0] == "dryrun";

const lucid = getLucidInstance();

const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);

// const refUtxos = await lucid.utxosAt(deployed.refscriptsScriptAddr);
const refUtxos = getDeployedRefUtxos(Object.values(deployed.referenceUtxos));
const lpContractRefUtxo = refUtxos.find((utxo) => {
    if (utxo.assets[deployed.refscriptsBcnTokens.lendingPool]) return true;
    else return false;
})!;
const globalCfgUtxo = parseStringifiedUtxo(deployed.cfgUtxos.globalCfgUtxo);

const loanableAsset: AssetClass = deployed.loanableAsset ?? tusdDeployed;
const lendingPoolUtxos = dryRun 
    ? [parseStringifiedUtxo(deployed.poolUtxo)]
    : await lucid.utxosAt(deployed.lendingPoolScriptAddr);
const lendingPoolUtxo = lendingPoolUtxos.find((utxo) => {
    if (utxo.assets[loanableAsset.policy_id + loanableAsset.asset_name]) return true;
    else return false;
}) as UTxO;

const referenceInputs = [lpContractRefUtxo, globalCfgUtxo];
const refInputsIdxs = orderUtxosCanonically(referenceInputs);
const cfg_idx = refInputsIdxs.get(globalCfgUtxo.txHash + globalCfgUtxo.outputIndex)!;
const withdrawLiqRedeemer: RedeemerBuilder = {
    kind: "selected",
    inputs: [lendingPoolUtxo],
    makeRedeemer: (inputIdxs: bigint[]) => {
        const redeemer: UnifiedRedeemerType = {
            [RedeemerEnum.WithdrawLendingPool]: {
                pool_input_idx: inputIdxs[0],
                cfg_idx: cfg_idx
            },
        };
        return Data.to(redeemer, UnifiedRedeemer);
    },
};

const tx = await lucid
    .newTx()
    .collectFrom([lendingPoolUtxo], withdrawLiqRedeemer)
    .readFrom(referenceInputs)
    .addSignerKey(adminPkh)
    .setMinFee(532465n)
    .complete();
console.log(`Withdraw liquidity tx built.`);

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
