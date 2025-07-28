import {
    Data,
    Datum,
    Script,
    validatorToAddress,
    applyParamsToScript,
    validatorToScriptHash,
    LucidEvolution
} from "@lucid-evolution/lucid";
import {
    blueprint,
    provNetwork,
    CredentialType,    
    AssetClassSchema,
    ScriptHashSchema,
    tusdDecimals,
    getLucidInstance,
} from "./common.ts";
import { 
    MinswapLpDatum,
    minswapLpToken, 
    minswapPoolAddress, 
    minswapBeaconToken,     
} from "./minswap.ts";
import { settingsScriptHash } from "./settings.ts";
import { refscriptsCredential } from "./refscripts.ts";

const OracleValParamSchema = ScriptHashSchema;
type OracleValParamType = Data.Static<typeof OracleValParamSchema>;
const OracleValParam = OracleValParamSchema as unknown as OracleValParamType;
const oracleValParam: OracleValParamType = settingsScriptHash;
const oracleValParamData: Data = Data.from(Data.to(oracleValParam, OracleValParam));
const oracleValidatorId = "oracle.oracle.spend";
const oracleCompiledCode = blueprint.validators.find((v: { title: string }) => v.title === oracleValidatorId).compiledCode;
export const oracleScript: Script = {
    type: "PlutusV3",
    script: applyParamsToScript(oracleCompiledCode, [oracleValParamData]),
};
export const oracleScriptHash = validatorToScriptHash(oracleScript);
export const oracleCredential = { type: CredentialType.script, hash: oracleScriptHash };
export const oraclePolicyID = oracleScriptHash;
export const oracleScriptAddr = validatorToAddress(provNetwork, oracleScript, refscriptsCredential);

export const OracleDatumSchema = Data.Object({
    timestamp: Data.Integer(),
    validity_period: Data.Integer(),
    quoted_asset: AssetClassSchema,
    denomination: AssetClassSchema,
    price: Data.Tuple([Data.Integer(), Data.Integer()]),
    consumers: Data.Array(Data.Bytes({ minLength: 28, maxLength: 28 })),
});
export type OracleDatumType = Data.Static<typeof OracleDatumSchema>;
export const OracleDatum = OracleDatumSchema as unknown as OracleDatumType;

export function makeOracleDatum(obj: OracleDatumType): Datum {
    const oracleDatumData: Datum = Data.to(obj, OracleDatum);
    return oracleDatumData;
}

export async function getUpdatedPrice(lucidInst?: LucidEvolution) {
    const lucid = lucidInst ?? getLucidInstance();
    const tusdLpToken = minswapLpToken.policy_id + minswapLpToken.asset_name;
    const dexPoolUtxos = await lucid.utxosAtWithUnit(minswapPoolAddress, tusdLpToken);
    const tusdPoolUtxo = dexPoolUtxos.find((utxo) => {
        if (utxo.assets[minswapBeaconToken.policy_id + minswapBeaconToken.asset_name]) return true;
        else return false;
    })!;
    const msLpDatum = Data.from(tusdPoolUtxo.datum!, MinswapLpDatum);
    const collateralReserveAmt = Number(msLpDatum.reserve_a);
    const loanableReserveAmt = Number(msLpDatum.reserve_b);
    const collateralPrice = Math.floor((loanableReserveAmt / collateralReserveAmt) * Math.pow(10, tusdDecimals));
    return [BigInt(collateralPrice), BigInt(tusdDecimals)] as [bigint, bigint];
}