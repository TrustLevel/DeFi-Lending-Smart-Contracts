import {
    Data,
    Script,
    validatorToAddress,
    applyParamsToScript,
    validatorToScriptHash,
} from "@lucid-evolution/lucid";
import { 
    blueprint, 
    provNetwork,
    AssetClassSchema,
    ScriptHashSchema,
} from "./common.ts";
import { refscriptsCredential } from "./refscripts.ts";
import { settingsScriptHash } from "./settings.ts";

const LendingPoolValParamSchema = ScriptHashSchema;
type LendingPoolValParamType = Data.Static<typeof LendingPoolValParamSchema>;
const LendingPoolValParam = LendingPoolValParamSchema as unknown as LendingPoolValParamType;
const lendingPoolValParam: LendingPoolValParamType = settingsScriptHash;
const lendingPoolValParamData: Data = Data.from(Data.to(lendingPoolValParam, LendingPoolValParam));

const lendingPoolValidatorId = "lending_pool.lending_pool.spend";
const lendingPoolCompiledCode =
    blueprint.validators.find((v: { title: string }) => v.title === lendingPoolValidatorId).compiledCode;
export const lendingPoolScript: Script = {
    type: "PlutusV3",
    script: applyParamsToScript(lendingPoolCompiledCode, [lendingPoolValParamData]),
};
export const lendingPoolScriptHash = validatorToScriptHash(lendingPoolScript);
export const lendingPoolPolicyID = lendingPoolScriptHash;
export const lendingPoolScriptAddr = validatorToAddress(provNetwork, lendingPoolScript, refscriptsCredential);

export type CollateralPrice = [bigint, bigint]; // [price, decimal digits]
export type InterestRate = [bigint, bigint]; // [term (in milliseconds), rate]

export const LendingPoolDatumSchema = Data.Object({
    loanable_asset: AssetClassSchema,
    collateral_asset: AssetClassSchema,
    interest_rates: Data.Array(
        Data.Tuple([Data.Integer(), Data.Integer()]),
    )
});
export type LendingPoolDatumType = Data.Static<typeof LendingPoolDatumSchema>;
export const LendingPoolDatum = LendingPoolDatumSchema as unknown as LendingPoolDatumType;

export function makeLendingPoolDatum(obj: LendingPoolDatumType): Data {
    const lendingPoolDatumData: Data = Data.to(obj, LendingPoolDatum);
    return lendingPoolDatumData;
}

// sample list of interest rates to be used in tests
export const intRatesList = {
    "3 hrs": { // 3 hrs, 5% (quick maturing, useful for testing)
        term: 10_800_000n,
        rate: 5n,
    },
    "7 days": { // 7 days, 8%
        term: 604_800_000n,
        rate: 8n,
    },
    "14 days": { // 14 days, 10%
        term: 1_209_600_000n,
        rate: 10n,
    },
    "30 days": { // 30 days, 15%
        term: 2_592_000_000n,
        rate: 15n,
    },
    "45 days": { // 45 days, 25%
        term: 3_888_000_000n,
        rate: 25n,
    },
};
