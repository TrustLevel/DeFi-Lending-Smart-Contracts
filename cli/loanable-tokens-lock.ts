import { Data, stringify } from "@lucid-evolution/lucid";
import { alwaysTrueScriptAddr, getLucidInstance, tusdDeployed } from "../index.ts";

/**
 * Lock tUSDM at the always_true contract to be redeemed later for the demo
 */

const lucid = getLucidInstance();

const loanableAssetId = tusdDeployed.policy_id + tusdDeployed.asset_name;

const tx = await lucid
    .newTx()
    .pay.ToContract(
        alwaysTrueScriptAddr,
        { kind: "inline", value: Data.void() },
        { [loanableAssetId]: 10_000_000_000_000n },
    )
    .complete();

const signedTx = await tx.sign.withWallet().complete();
console.log(`signedTx: ${stringify(signedTx)}`);
console.log(`signedTx hash: ${signedTx.toHash()}`);
console.log(`size: ~${signedTx.toCBOR().length / 2048} KB`);

console.log("");
const txJson = JSON.parse(stringify(signedTx));
console.log(`txFee: ${parseInt(txJson.body.fee) / 1_000_000} ADA`);
console.log("");

const txHash = await signedTx.submit();
console.log(`tx submitted. Hash: ${txHash}`);

