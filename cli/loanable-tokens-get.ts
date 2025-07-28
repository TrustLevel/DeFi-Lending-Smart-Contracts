import { Data, stringify } from "@lucid-evolution/lucid";
import { alwaysTrueScriptAddr, alwaysTrueScript } from "../lib/always-true.ts";
import { getLucidInstance } from "../index.ts";

/**
 * Redeem locked tUSDM from the always_true contract, to use in the demo
 */

const dryRun = Deno.args[0] == "dryrun";

const lucid = getLucidInstance();

const depUtxos = await lucid.utxosAt(alwaysTrueScriptAddr);

const tx = await lucid
    .newTx()
    .collectFrom(depUtxos, Data.void())
    .attach.Script(alwaysTrueScript)
    .complete();

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
console.log("");
