import {
    Credential,
    credentialToRewardAddress,
    Data,
    fromText,
    getAddressDetails,
    Kupmios,
    Blockfrost,
    Lucid,
    mintingPolicyToId,
    Network,
    scriptFromNative,
    validatorToAddress,
    validatorToScriptHash,
    ProtocolParameters,
} from "@lucid-evolution/lucid";

export const kupoUrl = Deno.env.get("KUPO_PREPROD") as string;
export const ogmiosUrl = Deno.env.get("OGMIOS_PREPROD") as string;
export const provNetwork = Deno.env.get("PROVIDER_NETWORK") as Network;
export const providerKupmios = new Kupmios(kupoUrl, ogmiosUrl);

export const bfrostUrl = provNetwork == "Preprod"
    ? "https://cardano-preprod.blockfrost.io/api/v0"
    : "https://cardano-mainnet.blockfrost.io/api/v0";
export const bfrostKey = provNetwork == "Preprod"
    ? Deno.env.get("BFROST_PREPROD") as string
    : Deno.env.get("BFROST_MAINNET") as string;    
export const providerBlockfrost = new Blockfrost(bfrostUrl, bfrostKey);

export const ORACLE_DATA_VALIDITY = Deno.env.get("ORACLE_DATA_VALIDITY") as string;

export const ADMIN_WALLET_SEED = Deno.env.get("ADMIN_WALLET_SEED") as string;
export const ORACLE_PRVDR1_SEED = Deno.env.get("ORACLE_PRVDR1_SEED") as string;
export const USER1_WALLET_SEED = Deno.env.get("USER1_WALLET_SEED") as string;
export const USER2_WALLET_SEED = Deno.env.get("USER2_WALLET_SEED") as string;

const lucidInit = await Lucid(providerBlockfrost, provNetwork);
const protocolParams = lucidInit.config().protocolParameters as ProtocolParameters;
protocolParams.maxTxSize = protocolParams.maxTxSize * 10;
const lucid = await Lucid(providerBlockfrost, provNetwork, {presetProtocolParameters: protocolParams});

lucid.selectWallet.fromSeed(ADMIN_WALLET_SEED);

export function getLucidInstance() {
    return lucid;
}

// Admin acct details
export const adminAddress = await lucid.wallet().address();
export const adminStakeCred = getAddressDetails(adminAddress).stakeCredential as Credential;
export const adminPaymtCred = getAddressDetails(adminAddress).paymentCredential as Credential;
export const adminStakeAddr = credentialToRewardAddress(provNetwork, adminStakeCred);
export const adminPkh = adminStakeCred.hash; // staking PKH
export const adminSpendPkh = adminPaymtCred.hash; // payment PKH

// Oracle provider 1 details
lucid.selectWallet.fromSeed(ORACLE_PRVDR1_SEED);
export const provider1Address = await lucid.wallet().address();
export const provider1PaymtCred = getAddressDetails(provider1Address).paymentCredential as Credential;
export const provider1PaymentHash = provider1PaymtCred.hash; // payment PKH
// switch active wallet back to admin's
lucid.selectWallet.fromSeed(ADMIN_WALLET_SEED);

export const settingsInitUtxo = (await lucid.utxosAt(adminAddress)).reverse()[0];

export const adminMintingScript = scriptFromNative({
    type: "all",
    scripts: [
        { type: "sig", keyHash: adminPkh },
        // { type: "after", slot: unixTimeToSlot(lucid.config().network as Network, 1704067200000) },
    ],
});
export const adminTokensPolicyId = mintingPolicyToId(adminMintingScript);

export const tusdMintingScript = scriptFromNative({
    type: "all",
    scripts: [
        { type: "sig", keyHash: adminSpendPkh },
        // { type: "after", slot: unixTimeToSlot(lucid.config().network as Network, 1704067201000) },
    ],
});
export const tusdTokensPolicyId = mintingPolicyToId(tusdMintingScript);

export const tusdRefTokenHolderScriptHash = validatorToScriptHash(tusdMintingScript);
export const tusdRefTokenHolderAddr = validatorToAddress(
    provNetwork,
    tusdMintingScript,
    { type: "Script", hash: tusdRefTokenHolderScriptHash },
);

// CIP68 token name prefixes
export const prefix_100 = "000643b0";
export const prefix_333 = "0014df10";

/**
 * Beacon tokens for the utxos that will hold the protocol's reference scripts
 */
export const refscriptsBcnTokens = {
    refscripts: adminTokensPolicyId + fromText(`refscripts`),
    settings: adminTokensPolicyId + fromText(`settings`),
    collateral: adminTokensPolicyId + fromText(`collateral`),
    lendingPool: adminTokensPolicyId + fromText(`lendingPool`),
    oracle: adminTokensPolicyId + fromText(`oracle`),
    registry: adminTokensPolicyId + fromText(`registry`),
    audit: adminTokensPolicyId + fromText(`audit`),
};

/**
 * Beacon token names for the settings and oracle utxos
 */
export const bcnTknsHex = {
    globalCfg: fromText(`GCFG`),
    oracleCfg: fromText(`OCFG`),
    audit: fromText(`AUDT`),
    oraclePrice: fromText(`OPRC`),    
};

export const blueprint = JSON.parse(
    new TextDecoder().decode(Deno.readFileSync("./onchain/plutus.json")),
);

export enum CredentialType {
    script = "Script",
    key = "Key",
}

export const AssetClassSchema = Data.Object({
    policy_id: Data.Bytes({ minLength: 0, maxLength: 28 }),
    asset_name: Data.Bytes({ minLength: 0, maxLength: 64 }),
});

export type AssetClass = Data.Static<typeof AssetClassSchema>;

// ada/lovelace asset class
export const adaAssetClass: AssetClass = {
    policy_id: fromText(""),
    asset_name: fromText(""),
};
// test USD (tUSD) asset class
export const tusdAssetClass: AssetClass = {
    policy_id: tusdTokensPolicyId,
    asset_name: prefix_333 + fromText("tUSDM"),
};

export enum DexType {
    Minswap = "Minswap",
    SundaeSwap = "SundaeSwap",
    WingRiders = "WingRiders",
}

export const DexContractSchema = Data.Object({
    order_contract: Data.Bytes({ minLength: 28, maxLength: 28 }),
});

export const LiquidationDexSchema = Data.Enum([
    Data.Object({
        [DexType.Minswap]: DexContractSchema,
    }),
    Data.Object({
        [DexType.SundaeSwap]: DexContractSchema,
    }),
    Data.Object({
        [DexType.WingRiders]: DexContractSchema,
    }),
]);

export const SignerHashSchema = Data.Bytes({ minLength: 28, maxLength: 28 });
export type SignerHashType = Data.Static<typeof SignerHashSchema>;
export const ScriptHashSchema = Data.Bytes({ minLength: 28, maxLength: 28 });
export type ScriptHashType = Data.Static<typeof ScriptHashSchema>;

export enum RedeemerEnum {
    BorrowRequest = "BorrowRequest",
    BorrowProcess = "BorrowProcess",
    RepayRequest = "RepayRequest",
    RepayProcess = "RepayProcess",
    LiquidateCollateral = "LiquidateCollateral",
    SettleLiquidation = "SettleLiquidation",
    WithdrawCollateral = "WithdrawCollateral",
    WithdrawLendingPool = "WithdrawLendingPool",
    MintSettingsBeacons = "MintSettingsBeacons",
    BurnSettingsBeacons = "BurnSettingsBeacons",
    UpdateGlobalCfg = "UpdateGlobalCfg",
    UpdateOracleCfg = "UpdateOracleCfg",
    MintOracleBeacon = "MintOracleBeacon",
    BurnOracleBeacon = "BurnOracleBeacon",
    UpdateOraclePrice = "UpdateOraclePrice",
    UpdateAuditDatum = "UpdateAuditDatum",
    UpdateLenderConfig = "UpdateLenderConfig",
}
const UnifiedRedeemerSchema = Data.Enum([
    Data.Object({
        [RedeemerEnum.BorrowRequest]: Data.Object({
            loan_amt: Data.Integer(),
            loan_term: Data.Integer(),
            loan_asset: AssetClassSchema,
            input_idx: Data.Integer(),
            output_idx: Data.Integer(),
        }),
    }),
    Data.Object({
        [RedeemerEnum.BorrowProcess]: Data.Object({
            collateral_idxs: Data.Tuple([Data.Integer(), Data.Integer()]),
            pool_idxs: Data.Tuple([Data.Integer(), Data.Integer()]),
            oracle_idx: Data.Integer(),
            cfg_idx: Data.Integer(),            
            registry_output_idx: Data.Integer(),
        }),
    }),
    Data.Object({
        [RedeemerEnum.RepayRequest]: Data.Object({
            collateral_idxs: Data.Tuple([Data.Integer(), Data.Integer()]),
            registry_idx: Data.Integer(),
            cfg_idx: Data.Integer(),
        }),
    }),
    Data.Object({
        [RedeemerEnum.RepayProcess]: Data.Object({
            collateral_idxs: Data.Tuple([Data.Integer(), Data.Integer()]),
            pool_idxs: Data.Tuple([Data.Integer(), Data.Integer()]),
            cfg_idx: Data.Integer(),
            registry_input_idx: Data.Integer(),
        }),
    }),
    Data.Object({
        [RedeemerEnum.LiquidateCollateral]: Data.Object({
            collateral_input_idx: Data.Integer(),
            registry_idxs: Data.Tuple([Data.Integer(), Data.Integer()]),
            dex_output_idx: Data.Integer(),
            oracle_idx: Data.Integer(),
            cfg_idx: Data.Integer(),
            liquidation_dex: LiquidationDexSchema,
            liquidator: SignerHashSchema,
        }),
    }),
    Data.Object({
        [RedeemerEnum.SettleLiquidation]: Data.Object({
            collateral_input_idx: Data.Integer(),
            registry_input_idx: Data.Integer(),
            pool_idxs: Data.Tuple([Data.Integer(), Data.Integer()]),
            cfg_idx: Data.Integer(),
        }),
    }),
    Data.Object({
        [RedeemerEnum.WithdrawCollateral]: Data.Object({
            input_idx: Data.Integer(),
        }),
    }),
    Data.Object({
        [RedeemerEnum.WithdrawLendingPool]: Data.Object({
            pool_input_idx: Data.Integer(),
            cfg_idx: Data.Integer(),
        }),
    }),
    Data.Object({
        [RedeemerEnum.MintSettingsBeacons]: Data.Object({
            init_utxo_idx: Data.Integer()
        }),
    }),
    Data.Object({
        [RedeemerEnum.BurnSettingsBeacons]: Data.Object({
            glob_cfg_utxo_idx: Data.Integer()
        }),
    }),
    Data.Object({
        [RedeemerEnum.UpdateGlobalCfg]: Data.Object({
            input_idx: Data.Integer(),
            output_idx: Data.Integer(),
        }),
    }),
    Data.Object({
        [RedeemerEnum.UpdateOracleCfg]: Data.Object({
            global_cfg_idx: Data.Integer(),
            oracle_cfg_idxs: Data.Tuple([Data.Integer(), Data.Integer()]),
        }),
    }),
    Data.Object({
        [RedeemerEnum.MintOracleBeacon]: Data.Object({
            cfg_idx: Data.Integer(),
        }),
    }),
    Data.Object({
        [RedeemerEnum.BurnOracleBeacon]: Data.Object({
            cfg_idx: Data.Integer(),
        }),
    }),
    Data.Object({
        [RedeemerEnum.UpdateOraclePrice]: Data.Object({
            price_idxs: Data.Tuple([Data.Integer(), Data.Integer()]),
            cfg_idx: Data.Integer(),
            provider: SignerHashSchema,
        }),
    }),
    Data.Object({
        [RedeemerEnum.UpdateAuditDatum]: Data.Object({
            audit_idxs: Data.Tuple([Data.Integer(), Data.Integer()]),
            gcfg_idx: Data.Integer(),
            ocfg_idx: Data.Integer(),
            pool_idx: Data.Integer(),
            oracle_idx: Data.Integer(),
            provider: SignerHashSchema,
        }),
    }),
    Data.Object({
        [RedeemerEnum.UpdateLenderConfig]: Data.Object({
            input_idx: Data.Integer(),
            output_idx: Data.Integer(),
            cfg_idx: Data.Integer(),
        }),
    }),
]);
export type UnifiedRedeemerType = Data.Static<typeof UnifiedRedeemerSchema>;
export const UnifiedRedeemer = UnifiedRedeemerSchema as unknown as UnifiedRedeemerType;

// Address type / schema
export type PlutusVerificationKey = { VerificationKey: [string] };
export type PlutusScriptKey = { Script: [string] };
export type PlutusPaymentCred = PlutusVerificationKey | PlutusScriptKey;
export type PlutusStakeCred = { Inline: [PlutusVerificationKey | PlutusScriptKey] } | {
    Pointer: { slot_number: bigint; transaction_index: bigint; certificate_index: bigint };
} | null;

export const CredSchema = Data.Enum([
    Data.Object({ VerificationKey: Data.Tuple([Data.Bytes()]) }),
    Data.Object({ Script: Data.Tuple([Data.Bytes()]) }),
]);
export const StakeCredSchema = Data.Nullable(
    Data.Enum([
        Data.Object({
            Inline: Data.Tuple([CredSchema]),
        }),
        Data.Object({
            Pointer: Data.Object({
                slot_number: Data.Integer(),
                transaction_index: Data.Integer(),
                certificate_index: Data.Integer(),
            }),
        }),
    ]),
);
export const AddressSchema = Data.Object({
    payment_credential: CredSchema,
    stake_credential: StakeCredSchema,
});

export type Address = Data.Static<typeof AddressSchema>;

// OutputReference schema
export const OutputRefSchema = Data.Object({
    transaction_id: Data.Bytes({ minLength: 32, maxLength: 32 }),
    output_index: Data.Integer(),
});
export type OutputReference = Data.Static<typeof OutputRefSchema>;

export const DatumHashSchema = Data.Bytes({ minLength: 32, maxLength: 32 });
export type DatumHashType = Data.Static<typeof DatumHashSchema>;

// deployed on preprod testnet:
export const tusdDeployed: AssetClass = {
    policy_id: "11c93226aabf1e9157620857d9ac013ba111680bd837f62a7ca90214",
    asset_name: "0014df10745553444d",
};
export const tusdDecimals = 6;

export const deployDetailsFile = "./data/deployed.json";
try {
    await Deno.lstat("./data");
    // do nothing if dir already exists
} catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
        throw err;
    }
    Deno.mkdirSync("./data");
}
