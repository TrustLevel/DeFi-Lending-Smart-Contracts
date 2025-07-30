use aiken/crypto.{ScriptHash, VerificationKeyHash}
use cardano/address.{Address}
use cardano/assets.{AssetName, PolicyId}
use cardano/transaction.{Input, Output, OutputReference}

pub type AssetClass {
  policy_id: PolicyId,
  asset_name: AssetName,
}

/// POSIX time in milliseconds
pub type PosixTime =
  Int

/// The loan request data structure that is part of the `LoanRequested` [CollateralStatus](#CollateralStatus)
pub type LoanRequest {
  borrowed_asset: AssetClass,
  borrowed_amt: Int,
  loan_term: Int,
}

/// The loan info data structure that is part of the [PositionRegistryDatum](#PositionRegistryDatum)
pub type LoanDatum {
  collateral_asset: AssetClass,
  borrowed_asset: AssetClass,
  collateral_amt: Int,
  borrowed_amt: Int,
  interest_amt: Int,
  loan_term: Int,
  maturity: PosixTime,
}

/// Collateral status constructors, for [CollateralDatum](#CollateralDatum)
pub type CollateralStatus {
  Available
  LoanRequested { request: LoanRequest }
  LoanIssued
  RepayRequested
}

/// The datum structure for `UTXO`s in the collateral manager contract.
pub type CollateralDatum {
  owner: Address,
  collateral_asset: AssetClass,
  status: CollateralStatus,
}

/// The datum structure for `UTXO`s in the `loans_registry` contract.
pub type PositionRegistryDatum {
  borrower: Address,
  loan: LoanDatum,
  pos_id: AssetName,
  liquidator: Option<Signer>,
}

/// Signers can be either a `ScriptHash` or a `VerificationKeyHash`, which are both just aliases for `ByteArray`.
pub type Signer =
  ByteArray

/// The datum structure for `UTXO`s at the `oracle` contract, containing price quotes.
pub type OracleDatum {
  /// the time of last update, expressed as POSIX time in milliseconds
  timestamp: PosixTime,
  /// the period to consider the price update usable, expressed as POSIX time duration in milliseconds
  validity_period: Int,
  /// the `AssetClass` of the asset whose price is quoted (i.e. the collateral asset)
  quoted_asset: AssetClass,
  /// the `AssetClass` of the asset that is used to price the quoted asset (i.e. the loanable asset)
  denomination: AssetClass,
  /// the price of the `quoted_asset` denominated in the `denomination` asset.
  price: QuotePrice,
  /// Can be used later, to whitelist consumers of oracle UTXOs
  consumers: List<Signer>,
}

/// The loan term expressed as a POSIX time duration `Int` (in milliseconds)
pub type Term =
  Int

/// The loan interest rate, expressed in whole number percentage figure (eg: `5` for 5%)
pub type IntRate =
  Int

/// A loan interest rate, expressed as a tuple containing the following items:
/// 1. The loan term ([`Term`](#Term))
/// 2. The loan interest rate ([`IntRate`](#IntRate))
pub type InterestRate =
  (Term, IntRate)

/// The price of the collateral asset denominated in the loanable asset.
///
/// Example: If we have a collateral in `ADA` and the loanable asset is `USDM`; and the
/// price of `ADA` is `0.812345 USDM`, this would be `812345`.
pub type Price =
  Int

/// The decimal digits of an asset's amount (especially applies to the loanable asset).
pub type DecimalDigits =
  Int

/// A tuple containg the price of an asset denominated in another asset, and the latter's decimal digits.
///
/// Example: If we are quoting the price of `ADA` in `USDM` as `0.812345 USDM` and `USDM` has 6 decimal digits, this would be `(812345, 6)`
pub type QuotePrice =
  (Price, DecimalDigits)

/// An alias for `QuotePrice`, and in this case particularly, a tuple containg the price of the collateral asset denominated in the loanable asset, and the loanable asset's decimal digits.
pub type CollateralPrice =
  QuotePrice

/// The lending pool `UTXO` datum structure.
pub type LendingPoolDatum {
  /// the `AssetClass` of the stable coin or any asset that can be borrowed
  loanable_asset: AssetClass,
  /// the `AssetClass` of the asset that can be used as collateral
  collateral_asset: AssetClass,
  /// the list of [`InterestRate`](#InterestRate) tuples
  interest_rates: List<InterestRate>,
}

/// Constructors for supported dexes used for liquidating overdue or undercollateralized positions
pub type LiquidationDex {
  Minswap { order_contract: ScriptHash }
  SundaeSwap { order_contract: ScriptHash }
  WingRiders { order_contract: ScriptHash }
}

/// The data structure of datums in UTXOs held by the `settings` contract
pub type SettingsDatum {
  GlobalSettings {
    admin_key_hash: VerificationKeyHash,
    /// the `ScriptHash` of the `lending_pool` validator
    pool_contract: ScriptHash,
    /// the `ScriptHash` of the `audit` validator
    audit_contract: ScriptHash,
    /// the `ScriptHash` of the `oracle` validator
    oracle_contract: ScriptHash,
    /// the `ScriptHash` of the `position_registry` validator
    registry_contract: ScriptHash,
    /// the `ScriptHash` of the `collateral` validator
    collateral_contract: ScriptHash,
    /// the loan-to-value ratio of the collateral asset, expressed in whole number percentage figure (eg: `70` for 70%)
    collateral_ratio: Int,
    /// the maximum transaction validity period allowed by the protocol, expressed as a POSIX time duration `Int` (in milliseconds)
    max_tx_validity: Int,
    /// the list of supported dexes used for liquidating overdue or undercollateralized positions
    liquidation_dexes: List<LiquidationDex>,
  }
  OracleSettings {
    /// the `ScriptHash` of the `oracle` validator
    oracle_contract: ScriptHash,
    /// the list of trusted providers' key hashes
    providers: List<Signer>,
  }
}

/// Stand-alone constructor type for the [`GlobalSettings`](#SettingsDatum), used for type checking and passing the value around
pub type CfgGlobal {
  admin_key_hash: VerificationKeyHash,
  pool_contract: ScriptHash,
  audit_contract: ScriptHash,
  oracle_contract: ScriptHash,
  registry_contract: ScriptHash,
  collateral_contract: ScriptHash,
  collateral_ratio: Int,
  max_tx_validity: Int,
  liquidation_dexes: List<LiquidationDex>,
}

/// Stand-alone constructor type for the [`OracleSettings`](#SettingsDatum), used for type checking and passing the value around
pub type CfgOracle {
  oracle_contract: ScriptHash,
  providers: List<Signer>,
}

/// The data structure of the datum in the `audit` UTXO
pub type AuditDatum {
  /// time of last update, POSIX time in milliseconds
  timestamp: PosixTime,
  /// the `AssetClass` of the asset that can be used as collateral
  collateral_asset: AssetClass,
  /// the `AssetClass` of the stable coin or any asset that can be borrowed
  loanable_asset: AssetClass,
  /// the loan-to-value ratio of the collateral asset, expressed in whole number percentage figure (eg: `70` for 70%)
  collateral_ratio: Int,
  /// total amount of collateral asset used to secure open loan positions
  total_collateral: Int,
  /// total amount of borrowed loanable asset in all open positions
  total_borrowed: Int,
  /// health score of the whole lending pool (numerator, denominator)
  health_score: (Int, Int),
  /// utilization rate of the whole lending pool (numerator, denominator)
  utilization_rate: (Int, Int),
}

/// The return type of [count_protocol_inputs()](./helpers.html#count_protocol_inputs) containing
/// the number of `Input`s from each of the protocol's contracts.
pub type ProtocolInputs {
  collateral: Int,
  lending_pool: Int,
  registry: Int,
}

/// The return type of [get_common_utxos()](./helpers.html#get_common_utxos)
pub type CommonUtxos {
  collateral_input: Input,
  collateral_output: Output,
  pool_input: Input,
  pool_output: Output,
}

/// The parameter for when compiling the parameterized `settings` contract
pub type SettingsValidatorParams {
  init_output_ref: OutputReference,
}

/// The data structure for the redeemer that can be used for any of the contracts in the protocol
pub type UnifiedRedeemer {
  BorrowRequest {
    loan_amt: Int,
    loan_term: Int,
    loan_asset: AssetClass,
    /// collateral input idx
    input_idx: Int,
    /// collateral output idx
    output_idx: Int,
  }
  BorrowProcess {
    /// (input_idx, output_idx)
    collateral_idxs: (Int, Int),
    /// lending_pool UTXO (input_idx, output_idx)
    pool_idxs: (Int, Int),
    /// oracle UTXO (reference input index)
    oracle_idx: Int,
    /// global settings UTXO (reference input index)
    cfg_idx: Int,
    /// position registry UTXO
    registry_output_idx: Int,
  }
  RepayRequest {
    /// (input_idx, output_idx)
    collateral_idxs: (Int, Int),
    /// position registry UTXO (reference input index)
    registry_idx: Int,
    /// global settings UTXO (reference input index)
    cfg_idx: Int,
  }
  RepayProcess {
    /// (input_idx, output_idx)
    collateral_idxs: (Int, Int),
    /// (input_idx, output_idx)
    pool_idxs: (Int, Int),
    /// global settings UTXO (reference input index)
    cfg_idx: Int,
    registry_input_idx: Int,
  }
  LiquidateCollateral {
    collateral_input_idx: Int,
    /// (input_idx, output_idx)
    registry_idxs: (Int, Int),
    dex_output_idx: Int,
    /// oracle UTXO (reference input index)
    oracle_idx: Int,
    /// global settings UTXO (reference input index)
    cfg_idx: Int,
    liquidation_dex: LiquidationDex,
    liquidator: Signer,
  }
  SettleLiquidation {
    collateral_input_idx: Int,
    registry_input_idx: Int,
    /// (input_idx, output_idx)
    pool_idxs: (Int, Int),
    /// global settings UTXO (reference input index)
    cfg_idx: Int,
  }
  WithdrawCollateral {
    /// collateral input idx
    input_idx: Int,
  }
  WithdrawLendingPool {
    /// lending_pool input idx
    pool_input_idx: Int,
    /// global settings UTXO (reference input index)
    cfg_idx: Int,
  }
  MintSettingsBeacons {
    /// The index of the input `UTXO` that will be used to mint the protocol's only _settings beacon tokens_.
    init_utxo_idx: Int,
  }
  BurnSettingsBeacons {
    /// The index of the input `UTXO` containing the global settings
    glob_cfg_utxo_idx: Int,
  }
  UpdateGlobalCfg {
    /// global settings input idx 
    input_idx: Int,
    /// global settings output idx
    output_idx: Int,
  }
  UpdateOracleCfg {
    /// global settings UTXO (reference input index)
    global_cfg_idx: Int,
    /// oracle settings UTXO (input_idx, output_idx)
    oracle_cfg_idxs: (Int, Int),
  }
  MintOracleBeacon {
    /// global settings UTXO (reference input index)
    cfg_idx: Int,
  }
  BurnOracleBeacon {
    /// global settings UTXO (reference input index)
    cfg_idx: Int,
  }
  UpdateOraclePrice {
    /// oracle UTXO with price datum (input_idx, output_idx)
    price_idxs: (Int, Int),
    /// oracle settings UTXO (reference input index)
    cfg_idx: Int,
    /// key hash of the provider that is submitting the price update
    provider: Signer,
  }
  UpdateAuditDatum {
    audit_idxs: (Int, Int),
    /// global settings UTXO (reference input index)
    gcfg_idx: Int,
    /// oracle settings UTXO (reference input index)
    ocfg_idx: Int,
    /// lending_pool UTXO (reference input index)
    pool_idx: Int,
    /// oracle UTXO (reference input index)
    oracle_idx: Int,
    /// key hash of the provider that is submitting the price update
    provider: Signer,
  }
  UpdateLenderConfig {
    /// lending_pool input idx
    input_idx: Int,
    /// lending_pool output idx
    output_idx: Int,
    /// global settings UTXO (reference input index)
    cfg_idx: Int,
  }
}
