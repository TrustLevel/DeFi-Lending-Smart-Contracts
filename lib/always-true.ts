import { blueprint, provNetwork } from "./common.ts";
import { refscriptsCredential } from "./refscripts.ts";
import { Script, validatorToScriptHash, validatorToAddress, validatorToRewardAddress } from "@lucid-evolution/lucid";

const useExisting = Deno.args[1] == "useExisting"; // for using existing deployed script on preprod network

const alwaysTrueValidatorId = "always_true.always_true.spend";
const alwaysTrueCompiledCode = useExisting
    ? "587e01010029800aba2aba1aab9eaab9dab9cab9a48888896600264653001300700198039804000cc01c0092225980099b8748008c020dd500144c8cc892898058009805980600098049baa0028a51401830070013004375400f149a2a660049211856616c696461746f722072657475726e65642066616c7365001365640041"
    : blueprint.validators.find((v: { title: string }) => v.title === alwaysTrueValidatorId).compiledCode;
export const alwaysTrueScript: Script = {
    type: "PlutusV3",
    script: alwaysTrueCompiledCode,
};
export const alwaysTrueScriptHash = validatorToScriptHash(alwaysTrueScript);
export const alwaysTrueScriptAddr = useExisting
    ? "addr_test1xqwjedaza7hpdu32r5aa6qemee5wvfrxau0mvmrzwt6x5mu6x7y0wcqaqef4kmppk7yw3pjysmfke7cjvlq4u4hka64qnf2nku"
    : validatorToAddress(provNetwork, alwaysTrueScript, refscriptsCredential);
export const alwaysTrueRewardAddr = validatorToRewardAddress(provNetwork, alwaysTrueScript);