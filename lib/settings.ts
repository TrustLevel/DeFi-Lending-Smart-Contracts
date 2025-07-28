import {
    Data,
    Datum,
    Script,
    validatorToAddress,
    applyParamsToScript,
    validatorToScriptHash,
    validatorToRewardAddress,    
} from "@lucid-evolution/lucid";
import {
    DexType,
    blueprint,
    provNetwork,
    OutputRefSchema,
    OutputReference,
    settingsInitUtxo,
    SignerHashSchema,
    ScriptHashSchema,
    LiquidationDexSchema,
} from "./common.ts";
import { refscriptsCredential } from "./refscripts.ts";
import { minswapOrderScriptHash } from "./minswap.ts";

const SettingsValParamsSchema = OutputRefSchema;
const SettingsValParams = SettingsValParamsSchema as unknown as OutputReference;
const settingsValParams: OutputReference = {
    transaction_id: settingsInitUtxo.txHash,
    output_index: BigInt(settingsInitUtxo.outputIndex),
};
export const settingsValParamsData: Data = Data.from(Data.to(settingsValParams, SettingsValParams));
const settingsValidatorId = "settings.settings.spend";
const settingsCompiledCode =
    blueprint.validators.find((v: { title: string }) => v.title === settingsValidatorId).compiledCode;
export const settingsScript: Script = {
    type: "PlutusV3",
    script: applyParamsToScript(settingsCompiledCode, [settingsValParamsData]),
};
export const settingsScriptHash = validatorToScriptHash(settingsScript);
export const settingsPolicyID = settingsScriptHash;
export const settingsScriptAddr = validatorToAddress(provNetwork, settingsScript, refscriptsCredential);
export const settingsRewardAddr = validatorToRewardAddress(provNetwork, settingsScript);

export enum SettingsEnum {
    GlobalSettings = "GlobalSettings",
    OracleSettings = "OracleSettings"
}

export const GlobalSettingsSchema = Data.Object({
    admin_key_hash: SignerHashSchema,
    pool_contract: ScriptHashSchema,
    audit_contract: ScriptHashSchema,
    oracle_contract: ScriptHashSchema,
    registry_contract: ScriptHashSchema,
    collateral_contract: ScriptHashSchema,
    collateral_ratio: Data.Integer(),
    max_tx_validity: Data.Integer(),
    liquidation_dexes: Data.Array(LiquidationDexSchema)
});
export type GlobalSettingsType = Data.Static<typeof GlobalSettingsSchema>;

export const OracleSettingsSchema = Data.Object({
    oracle_contract: ScriptHashSchema,
    providers: Data.Array(SignerHashSchema),
});
export type OracleSettingsType = Data.Static<typeof OracleSettingsSchema>;

export const SettingsDatumSchema = Data.Enum([
    Data.Object({
        [SettingsEnum.GlobalSettings]: GlobalSettingsSchema,
    }),
    Data.Object({
        [SettingsEnum.OracleSettings]: OracleSettingsSchema,
    }),
]);

export type SettingsDatumType = Data.Static<typeof SettingsDatumSchema>;
export const SettingsDatum = SettingsDatumSchema as unknown as SettingsDatumType;

export function makeSettingsDatum(obj: SettingsDatumType): Datum {
    const settingsDatumData: Datum = Data.to(obj, SettingsDatum);
    return settingsDatumData;
}


// Initial settings:
export const collateralRatio = 70n; // 70%
export const maxTxValidity = 7_200_000n; // 2 hrs in Posix time (ms)
export const minswapDex = {
    [DexType.Minswap]: {
        order_contract: minswapOrderScriptHash,
    },
}
export const supportedDexes = [minswapDex]