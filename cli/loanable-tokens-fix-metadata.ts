import { Data, Datum, fromText, stringify } from "@lucid-evolution/lucid";
import { getLucidInstance, prefix_100, prefix_333, tusdRefTokenHolderAddr, tusdTokensPolicyId } from "../index.ts";

const lucid = getLucidInstance();

/**
 * Locks the reference token (100)tUSDM that comes with the CIP68 metadata at
 * `tusdRefTokenHolderAddr` so that its utxo can't be easily spent.
 *
 * @returns {Promise<void>}
 */
export async function fixRefToken(): Promise<void> {
    const cip68Token = {
        user: tusdTokensPolicyId + prefix_333 + fromText("tUSDM"),
        ref: tusdTokensPolicyId + prefix_100 + fromText("tUSDM"),
    };
    const Cip68DatumSchema = Data.Object({
        metadata: Data.Map(Data.Bytes(), Data.Any()),
        version: Data.Integer(),
    });
    type Cip68Datum = Data.Static<typeof Cip68DatumSchema>;
    const Cip68Datum = Cip68DatumSchema as unknown as Cip68Datum;
    const metadata = new Map();
    metadata.set(fromText(`name`), fromText(`tUSDM`));
    metadata.set(fromText(`description`), fromText(`Fiat-backed stablecoin native to the Cardano blockchain`));
    metadata.set(fromText(`ticker`), fromText(`tUSDM`));
    metadata.set(fromText(`url`), fromText(`https://mehen.io/`));
    metadata.set(fromText(`decimals`), 6n);
    metadata.set(fromText(`logo`), fromText(`ipfs://QmPxYepEFHtu3GBRuK6RhL5wKrSmxgYjbEu8CAdFw4Dghq`));
    const cip68Datum = {
        metadata: metadata,
        version: 1n,
    };
    const cip68DatumData: Data = Data.to(cip68Datum, Cip68Datum);

    const tx = await lucid
        .newTx()
        .pay.ToContract(
            tusdRefTokenHolderAddr,
            { kind: "inline", value: cip68DatumData as Datum },
            { [cip68Token.ref]: 1n },
        )
        .complete();
    console.log(`tx built`);

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

    console.log("");
}
fixRefToken();
