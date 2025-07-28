import {
    applyParamsToScript,
    Credential,
    Data,
    Datum,
    Script,
    UTxO,
    validatorToAddress,
    validatorToScriptHash,
} from "@lucid-evolution/lucid";
import {
    blueprint,
    provNetwork,
    AddressSchema,
    PlutusStakeCred,
    AssetClassSchema,
    ScriptHashSchema,
    PlutusPaymentCred,    
} from "./common.ts";
import { refscriptsCredential } from "./refscripts.ts";
import { settingsScriptHash } from "./settings.ts";
import { assertEquals } from "@std/assert";

const CollateralValParamSchema = ScriptHashSchema;
type CollateralValParamType = Data.Static<typeof CollateralValParamSchema>;
const CollateralValParam = CollateralValParamSchema as unknown as CollateralValParamType;
const collateralValParam: CollateralValParamType = settingsScriptHash;
const collateralValParamData: Data = Data.from(Data.to(collateralValParam, CollateralValParam));
const collateralValidatorId = "collateral.collateral.spend";
const collateralCompiledCode =
    blueprint.validators.find((v: { title: string }) => v.title === collateralValidatorId).compiledCode;
export const collateralScript: Script = {
    type: "PlutusV3",
    script: applyParamsToScript(collateralCompiledCode, [collateralValParamData]),
};
export const collateralScriptHash = validatorToScriptHash(collateralScript);
export const collateralScriptAddr = validatorToAddress(provNetwork, collateralScript, refscriptsCredential);

export enum CollateralStatusEnum {
    Available = "Available",
    LoanRequested = "LoanRequested",
    LoanIssued = "LoanIssued",
    RepayRequested = "RepayRequested",
}

export const LoanRequestSchema = Data.Object({
    borrowed_asset: AssetClassSchema,
    borrowed_amt: Data.Integer(),
    loan_term: Data.Integer(),
});
export const CollateralStatusSchema = Data.Enum([
    Data.Literal(CollateralStatusEnum.Available),
    Data.Object({
        [CollateralStatusEnum.LoanRequested]: Data.Object({
            request: LoanRequestSchema,
        }),
    }),
    Data.Literal(CollateralStatusEnum.LoanIssued),
    Data.Literal(CollateralStatusEnum.RepayRequested),
]);
export const CollateralDatumSchema = Data.Object({
    owner: AddressSchema,
    collateral_asset: AssetClassSchema,
    status: CollateralStatusSchema,
});
export type CollateralDatumType = Data.Static<typeof CollateralDatumSchema>;
export const CollateralDatum = CollateralDatumSchema as unknown as CollateralDatumType;

export function makeCollateralDatum(obj: CollateralDatumType): Datum {
    const collateralDatumData: Datum = Data.to(obj, CollateralDatum);
    return collateralDatumData;
}

export function getMyCollateralUtxo(
    utxos: UTxO[],
    userPaymentCred: Credential,
    userStakeCred?: Credential,
    status: CollateralStatusEnum = CollateralStatusEnum.Available,
): UTxO | null {
    const paymentCred: PlutusPaymentCred = userPaymentCred.type === "Key"
        ? { VerificationKey: [userPaymentCred.hash] }
        : { Script: [userPaymentCred.hash] };
    const stakeCred: PlutusStakeCred = (() => {
        if (userStakeCred) {
            return userStakeCred.type === "Key"
                ? { Inline: [{ VerificationKey: [userStakeCred.hash] }] }
                : { Inline: [{ Script: [userStakeCred.hash] }] };
        } else return null;
    })();
    const myUtxo = utxos.find((utxo) => {
        if (!utxo.datum) return false;

        const datum = Data.from(utxo.datum, CollateralDatum);
        const owner = datum.owner;

        const paymentCredMatches = (() => {
            try {
                assertEquals(paymentCred, owner.payment_credential);
                // console.log(`paymentCredMatches!`);
                return true;
            } catch (_error) {
                // console.log(`paymentCred does not match.`);
                return false;
            }
        })();
        const stakeCredMatches = (() => {
            try {
                assertEquals(stakeCred, owner.stake_credential);
                // console.log(`stakeCredMatches!`);
                return true;
            } catch (_error) {
                // console.log(`stakeCred does not match.`);
                return false;
            }
        })();

        const status_matches = (() => {
            switch (status) {
                case CollateralStatusEnum.Available:
                    return datum.status === CollateralStatusEnum.Available;
                case CollateralStatusEnum.LoanRequested:
                    return Object.keys(datum.status)[0] === CollateralStatusEnum.LoanRequested;
                case CollateralStatusEnum.LoanIssued:
                    return datum.status === CollateralStatusEnum.LoanIssued;
                case CollateralStatusEnum.RepayRequested:
                    return datum.status === CollateralStatusEnum.RepayRequested;
                default:
                    return false;
            }
        })();

        return paymentCredMatches && stakeCredMatches && status_matches;
    });
    return myUtxo ?? null;
}
