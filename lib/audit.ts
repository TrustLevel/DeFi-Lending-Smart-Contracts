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
    ScriptHashType,
    AssetClassSchema,
    ScriptHashSchema,    
} from "./common.ts";
import { refscriptsCredential } from "./refscripts.ts";
import { settingsScriptHash } from "./settings.ts";

const AuditValParamSchema = ScriptHashSchema;
const AuditValParam = AuditValParamSchema as unknown as ScriptHashType;
const auditValParam: ScriptHashType = settingsScriptHash;
export const auditValParamData: Data = Data.from(Data.to(auditValParam, AuditValParam));
const auditValidatorId = "audit.audit.spend";
const auditCompiledCode =
    blueprint.validators.find((v: { title: string }) => v.title === auditValidatorId).compiledCode;
export const auditScript: Script = {
    type: "PlutusV3",
    script: applyParamsToScript(auditCompiledCode, [auditValParamData]),
};
export const auditScriptHash = validatorToScriptHash(auditScript);
export const auditScriptAddr = validatorToAddress(provNetwork, auditScript, refscriptsCredential);

export const AuditDatumSchema = Data.Object({
    timestamp: Data.Integer(),
    collateral_asset: AssetClassSchema,
    loanable_asset: AssetClassSchema,
    collateral_ratio: Data.Integer(),
    total_collateral: Data.Integer(),
    total_borrowed: Data.Integer(),
    health_score: Data.Tuple([Data.Integer(), Data.Integer()]),
    utilization_rate: Data.Tuple([Data.Integer(), Data.Integer()]),
});

export type AuditDatumType = Data.Static<typeof AuditDatumSchema>;
export const AuditDatum = AuditDatumSchema as unknown as AuditDatumType;

export function makeAuditDatum(obj: AuditDatumType): Datum {
    const auditDatumData: Datum = Data.to(obj, AuditDatum);
    return auditDatumData;
}
