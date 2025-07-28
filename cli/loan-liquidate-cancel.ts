import { 
    Data,
    OutRef,
    stringify,
} from "@lucid-evolution/lucid";
import { 
    adminPkh,
    deployDetailsFile, 
    getLucidInstance, 
    RegistryDatum,
    MsOrderRedeemer,    
    MsOrderRedeemerEnum,
    MinswapOrderDatum,
    MinswapEODEnum,
} from "../index.ts";

// *************************************************************************
// *                         CANCEL MINSWAP ORDER                         *
// *************************************************************************

const marketOrderToCancel: OutRef = {
    txHash: "78669bd96678749b4166d37375a2d44db1c712384751153e5b85d0b48ac68157",
    outputIndex: 1
}


const dryRun = Deno.args[0] == "dryrun";

const lucid = getLucidInstance();
const deployed = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync(deployDetailsFile)),
);

const positionUtxo = (await lucid.utxosByOutRef([{
    txHash: "78669bd96678749b4166d37375a2d44db1c712384751153e5b85d0b48ac68157",
    outputIndex: 0
}]))[0];
const positionDatum = Data.from(positionUtxo.datum!, RegistryDatum);
const loan = positionDatum.loan;
const borrowedAssetId = loan.borrowed_asset.policy_id + loan.borrowed_asset.asset_name;
// console.log(`positionDatum: ${stringify(positionDatum)}`);
// if (positionDatum){
//     Deno.exit(0);
// }


const orderUtxo = (await lucid.utxosByOutRef([marketOrderToCancel]))[0];
const orderUtxoDatum = Data.from(orderUtxo.datum!, MinswapOrderDatum);
const orderEOD = orderUtxoDatum.refund_receiver_datum as {[MinswapEODEnum.MinEODDatumHash]: {hash: string}};
const orderEODHash = orderEOD[MinswapEODEnum.MinEODDatumHash].hash;

// `orderTxId` from https://github.com/minswap/minswap-dex-v2/blob/main/deployed/preprod/references.json
const minswapOrderScriptRefUtxo = (await lucid.utxosByOutRef([{
    txHash: "8c98f0530cba144d264fbd2731488af25257d7ce6a0cd1586fc7209363724f03",
    outputIndex: 0
}]))[0];

const cancelOrderRedeemer = Data.to(MsOrderRedeemerEnum.CancelOrderByOwner, MsOrderRedeemer);

const tx = await lucid
    .newTx()
    .collectFrom([orderUtxo], cancelOrderRedeemer)
    .readFrom([minswapOrderScriptRefUtxo])
    .pay.ToContract(
        deployed.collateralScriptAddr,
        { kind: "hash" , value: orderEODHash },
        {[borrowedAssetId]: loan.borrowed_amt + loan.interest_amt + 100_000_000n },
    )
    .addSignerKey(adminPkh)
    .attachMetadata(674, { msg: ["Minswap: Cancel Order"] })
    .complete();
console.log(`Cancel minswap order tx built.`);

const signedTx = await tx.sign.withWallet().complete();
console.log(`signedTx: ${stringify(signedTx)}`);
console.log(`signedTx hash: ${signedTx.toHash()}`);
console.log(`size: ~${signedTx.toCBOR().length / 2048} KB`);
console.log("");
const txJson = JSON.parse(stringify(signedTx));
console.log(`txFee: ${parseInt(txJson.body.fee) / 1_000_000} ADA`);
console.log("");

if (!dryRun) {
    const txHash = await signedTx.submit();
    console.log(`tx submitted. Hash: ${txHash}`);
}
console.log("");