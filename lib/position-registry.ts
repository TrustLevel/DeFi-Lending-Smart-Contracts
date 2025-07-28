import {
    Data,
    Datum,
    Script,
    validatorToAddress,
    applyParamsToScript,
    validatorToScriptHash,
} from "@lucid-evolution/lucid";
import { 
    blueprint, 
    provNetwork,
    AddressSchema, 
    AssetClassSchema,    
    ScriptHashSchema,
    SignerHashSchema,
} from "./common.ts";
import { refscriptsCredential } from "./refscripts.ts";
import { settingsScriptHash } from "./settings.ts";

const RegistryValParamSchema = ScriptHashSchema;
type RegistryValParamType = Data.Static<typeof RegistryValParamSchema>;
const RegistryValParam = RegistryValParamSchema as unknown as RegistryValParamType;
const registryValParam: RegistryValParamType = settingsScriptHash;
const registryValParamData: Data = Data.from(Data.to(registryValParam, RegistryValParam));

const registryValidatorId = "position_registry.registry.spend";
const registryCompiledCode = blueprint.validators.find((v: { title: string }) => v.title === registryValidatorId).compiledCode;
export const registryScript: Script = {
    type: "PlutusV3",
    script: applyParamsToScript(registryCompiledCode, [registryValParamData]),
};
export const registryScriptHash = validatorToScriptHash(registryScript);
export const registryScriptAddr = validatorToAddress(provNetwork, registryScript, refscriptsCredential);

export const LoanDatumSchema = Data.Object({
    collateral_asset: AssetClassSchema,
    borrowed_asset: AssetClassSchema,
    collateral_amt: Data.Integer(),
    borrowed_amt: Data.Integer(),
    interest_amt: Data.Integer(),
    loan_term: Data.Integer(),
    maturity: Data.Integer(),
});
export const RegistryDatumSchema = Data.Object({
    borrower: AddressSchema,
    loan: LoanDatumSchema,
    pos_id: Data.Bytes({ minLength: 0, maxLength: 64 }),
    liquidator: Data.Nullable(SignerHashSchema)
});
export type RegistryDatumType = Data.Static<typeof RegistryDatumSchema>;
export const RegistryDatum = RegistryDatumSchema as unknown as RegistryDatumType;

export function makeRegistryDatum(obj: RegistryDatumType): Datum {
    const registryDatumData: Datum = Data.to(obj, RegistryDatum);
    return registryDatumData;
}
