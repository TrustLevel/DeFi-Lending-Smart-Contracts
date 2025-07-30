//// This module contains constant values that are used by the unit tests for the validators

use aiken/builtin.{multiply_integer, quotient_integer, serialise_data}
use aiken/crypto.{blake2b_256, sha3_256}
use aiken/interval
use aiken/math.{pow}
use aiken/primitive/bytearray.{concat}
use aiken/primitive/string
use cardano/address.{Address, Inline, Script, VerificationKey}
use cardano/assets.{
  ada_asset_name, ada_policy_id, from_asset, from_lovelace, lovelace_of, merge,
  negate,
}
use cardano/certificate.{UnregisterCredential}
use cardano/transaction.{
  DatumHash, InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
  placeholder,
}
use constants.{
  audit_token, global_cfg_token, oracle_cfg_token, oracle_price_token,
}
use minswap.{
  MinEODDatumHash, MinswapOrderDatum, OAMSignature, SAOSpecificAmount,
  SwapExactIn,
}
use types.{
  AssetClass, AuditDatum, Available, BorrowProcess, BorrowRequest,
  BurnOracleBeacon, BurnSettingsBeacons, CollateralDatum, CollateralPrice,
  GlobalSettings, InterestRate, LendingPoolDatum, LiquidateCollateral, LoanDatum,
  LoanIssued, LoanRequest, LoanRequested, Minswap, MintOracleBeacon,
  MintSettingsBeacons, OracleDatum, OracleSettings, PositionRegistryDatum,
  PosixTime, RepayProcess, RepayRequest, RepayRequested, SettleLiquidation,
  UpdateAuditDatum, UpdateGlobalCfg, UpdateOracleCfg, UpdateOraclePrice,
  WithdrawCollateral, WithdrawLendingPool,
}

pub const refscripts_script_hash =
  #"00a0b79a29bb50da169ef9ee302aa8acca1dd62ba2d7fa57331847f0"

pub const settings_script_hash =
  #"00a0b79a29bb50da169ef9ee302aa8acca1dd62ba2d7fa57331847f1"

pub const collateral_script_hash =
  #"00a0b79a29bb50da169ef9ee302aa8acca1dd62ba2d7fa57331847f2"

pub const lending_pool_script_hash =
  #"00a0b79a29bb50da169ef9ee302aa8acca1dd62ba2d7fa57331847f3"

pub const oracle_script_hash =
  #"00a0b79a29bb50da169ef9ee302aa8acca1dd62ba2d7fa57331847f4"

pub const registry_script_hash =
  #"00a0b79a29bb50da169ef9ee302aa8acca1dd62ba2d7fa57331847f5"

pub const audit_script_hash =
  #"00a0b79a29bb50da169ef9ee302aa8acca1dd62ba2d7fa57331847f6"

pub const minswap_script_hash =
  #"00a0b79a29bb50da169ef9ee302aa8acca1dd62ba2d7fa57331847f7"

pub const refscripts_script_address =
  Address {
    payment_credential: Script(refscripts_script_hash),
    stake_credential: None,
  }

pub const settings_script_address =
  Address {
    payment_credential: Script(settings_script_hash),
    stake_credential: None,
  }

pub const collateral_script_address =
  Address {
    payment_credential: Script(collateral_script_hash),
    stake_credential: None,
  }

pub const lending_pool_script_address =
  Address {
    payment_credential: Script(lending_pool_script_hash),
    stake_credential: None,
  }

pub const oracle_script_address =
  Address {
    payment_credential: Script(oracle_script_hash),
    stake_credential: None,
  }

pub const registry_script_address =
  Address {
    payment_credential: Script(registry_script_hash),
    stake_credential: None,
  }

pub const audit_script_address =
  Address {
    payment_credential: Script(audit_script_hash),
    stake_credential: None,
  }

pub const minswap_order_address =
  Address {
    payment_credential: Script(minswap_script_hash),
    stake_credential: None,
  }

pub const admin_key_hash =
  #"da299558c70a8970781806dca93d1801ba2f3b3894227a7b284786e4"

pub const admin_address =
  Address {
    payment_credential: VerificationKey(admin_key_hash),
    stake_credential: None,
  }

pub const user_payment_keyhash =
  #"d48838fee1e840857dab28a04dd88193aec8c297b85d8150c0a1f5cc"

pub const user_staking_keyhash =
  #"6313a1d2c296eb3341e159b6c5c6991de11e81062b95108c9aa024ad"

pub const user_address =
  Address {
    payment_credential: VerificationKey(user_payment_keyhash),
    stake_credential: Some(Inline(VerificationKey(user_staking_keyhash))),
  }

pub const liquidator_keyhash =
  #"db26f43644bfb8b4fdfc0b92bd56f446fa4d4acce4cc3102b4ac9734"

pub const liquidator_stake_hash =
  #"a36e7b2fde2d0f04dc2727f32e71f999f097f00cd1be4ba4f6743adf"

pub const liquidator_address =
  Address {
    payment_credential: VerificationKey(liquidator_keyhash),
    stake_credential: Some(Inline(VerificationKey(liquidator_stake_hash))),
  }

pub const oracle_provider1_keyhash =
  #"a4ab0aa7b5d3b32b25daf0fbd5091e7eb7621ace6858792d1dbfcc6a"

pub const oracle_provider1_stake_hash =
  #"690d36b45855ef891f1c901c0159d194ef218bc20a78ffea85fed4da"

pub const oracle_provider1_address =
  Address {
    payment_credential: VerificationKey(oracle_provider1_keyhash),
    stake_credential: Some(Inline(VerificationKey(oracle_provider1_stake_hash))),
  }

pub const collateral_asset =
  AssetClass { policy_id: ada_policy_id, asset_name: ada_asset_name }

pub const loanable_asset =
  AssetClass {
    policy_id: #"c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad",
    asset_name: #"0014df105553444d",
  }

/// List of interest rates [`List<InterestRate>`](./types.html#InterestRate) for 3 hrs, 7 days, 14 days, 30 days, and 45 days
pub const interest_rates: List<InterestRate> =
  [
    (10_800_000, 5), (604_800_000, 8), (1_209_600_000, 10), (2_592_000_000, 15),
    (3_888_000_000, 25),
  ]

/// 2 hrs, in [`PosixTime`](./types.html#PosixTime) interval
pub const max_tx_validity: Int = 7_200_000

/// 3hrs, in [`PosixTime`](./types.html#PosixTime) interval
pub const loan_term = 3_888_000_000

pub const loan_amt = 525_000_000

pub const collateral_amt = 2_000_000_000

pub const interest_rate = 25

pub const interest_amt =
  multiply_integer(loan_amt, interest_rate)
    |> quotient_integer(100)

/// April 3, 2025 12:00:00 PM GMT, in [`PosixTime`](./types.html#PosixTime)
pub const maturity_time: PosixTime = 1_743_681_600_000

/// Collateral value % used in determining loanable amount (LTV)
pub const collateral_ratio: Int = 70

/// To be used for initial input utxos
pub const txid_0 =
  #"0000000000000000000000000000000000000000000000000000000000000000"

/// To be used for the sample tx making a loan request
pub const txid_1 =
  #"0000000000000000000000000000000000000000000000000000000000000001"

/// To be used for the sample tx fulfilling a loan request (issuing a loan)
pub const txid_2 =
  #"0000000000000000000000000000000000000000000000000000000000000002"

/// To be used for the sample tx making a loan repayment request
pub const txid_3 =
  #"0000000000000000000000000000000000000000000000000000000000000003"

/// To be used for the sample tx fulfilling a loan repayment request
pub const txid_4 =
  #"0000000000000000000000000000000000000000000000000000000000000004"

/// To be used for the sample tx liquidating an open loan position
pub const txid_5 =
  #"0000000000000000000000000000000000000000000000000000000000000005"

/// To be used for the sample tx updating oracle price datum
pub const txid_6 =
  #"0000000000000000000000000000000000000000000000000000000000000006"

/// To be used for the sample tx updating oracle settings datum
pub const txid_7 =
  #"0000000000000000000000000000000000000000000000000000000000000007"

/// To be used for the sample tx updating lending_pool settings datum
pub const txid_8 =
  #"0000000000000000000000000000000000000000000000000000000000000008"

pub const beacon_token_global_cfg_value =
  from_asset(settings_script_hash, global_cfg_token, 1)

pub const beacon_token_oracle_cfg_value =
  from_asset(settings_script_hash, oracle_cfg_token, 1)

pub const beacon_token_audit_value =
  from_asset(settings_script_hash, audit_token, 1)

pub const init_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_0,
      output_index: 0,
    },
    output: Output {
      address: admin_address,
      value: from_lovelace(1_000_000_000),
      datum: NoDatum,
      reference_script: None,
    },
  }

pub const global_cfg_datum =
  GlobalSettings {
    admin_key_hash,
    pool_contract: lending_pool_script_hash,
    audit_contract: audit_script_hash,
    oracle_contract: oracle_script_hash,
    registry_contract: registry_script_hash,
    collateral_contract: collateral_script_hash,
    collateral_ratio,
    max_tx_validity,
    liquidation_dexes: [Minswap { order_contract: minswap_script_hash }],
  }

pub const global_cfg_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_1,
      output_index: 0,
    },
    output: Output {
      address: settings_script_address,
      value: merge(from_lovelace(2_000_000), beacon_token_global_cfg_value),
      datum: InlineDatum(global_cfg_datum),
      reference_script: None,
    },
  }

pub const oracle_cfg_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_1,
      output_index: 1,
    },
    output: Output {
      address: settings_script_address,
      value: merge(from_lovelace(2_000_000), beacon_token_oracle_cfg_value),
      datum: InlineDatum(
        OracleSettings {
          oracle_contract: oracle_script_hash,
          providers: [admin_key_hash, oracle_provider1_keyhash],
        },
      ),
      reference_script: None,
    },
  }

/// Sample tx that successfully initializes the protocol with initial settings UTXOs
pub const tx_init_protocol =
  Transaction {
    ..placeholder,
    mint: merge(beacon_token_global_cfg_value, beacon_token_oracle_cfg_value)
      |> merge(beacon_token_audit_value),
    inputs: [init_utxo],
    outputs: [global_cfg_utxo.output, oracle_cfg_utxo.output],
  }

pub const redeemer_init_mint = MintSettingsBeacons { init_utxo_idx: 0 }

pub const admin_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_0,
      output_index: 1,
    },
    output: Output {
      address: admin_address,
      value: from_lovelace(1_000_000_000),
      datum: NoDatum,
      reference_script: None,
    },
  }

pub const user_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_0,
      output_index: 2,
    },
    output: Output {
      address: user_address,
      value: from_lovelace(1_000_000_000),
      datum: NoDatum,
      reference_script: None,
    },
  }

pub const available_collateral_datum =
  CollateralDatum { owner: user_address, collateral_asset, status: Available }

pub const loan_issued_collateral_datum =
  CollateralDatum { owner: user_address, collateral_asset, status: LoanIssued }

pub const available_collateral_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_0,
      output_index: 3,
    },
    output: Output {
      address: collateral_script_address,
      value: from_lovelace(collateral_amt),
      datum: InlineDatum(available_collateral_datum),
      reference_script: None,
    },
  }

/// Sample tx that successfully withdraws collateral that is available
pub const tx_withdraw_collat =
  Transaction {
    ..placeholder,
    inputs: [user_utxo, available_collateral_utxo],
    outputs: [
      Output {
        address: user_address,
        value: available_collateral_utxo.output.value,
        datum: NoDatum,
        reference_script: None,
      },
    ],
    extra_signatories: [user_payment_keyhash],
  }

pub const redeemer_withdraw_collat = WithdrawCollateral { input_idx: 1 }

pub const loan_reqst_datum =
  LoanRequest {
    borrowed_asset: loanable_asset,
    borrowed_amt: loan_amt,
    loan_term,
  }

pub const loan_requested_collateral_datum =
  CollateralDatum {
    owner: user_address,
    collateral_asset,
    status: LoanRequested { request: loan_reqst_datum },
  }

/// Loan term indicated in loan request: 3hrs, in [`PosixTime`](./types.html#PosixTime) interval
/// Amount requested to borrow: 525 USD
pub const loan_req_collateral_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_1,
      output_index: 2,
    },
    output: Output {
      address: collateral_script_address,
      value: from_lovelace(collateral_amt),
      datum: InlineDatum(loan_requested_collateral_datum),
      reference_script: None,
    },
  }

/// Sample tx that successfully submits a loan request
pub const tx_borrow_request =
  Transaction {
    ..placeholder,
    inputs: [available_collateral_utxo],
    outputs: [loan_req_collateral_utxo.output],
    extra_signatories: [user_payment_keyhash],
  }

pub const redeemer_borrow_request =
  BorrowRequest {
    loan_amt,
    loan_term,
    loan_asset: loanable_asset,
    input_idx: 0,
    output_idx: 0,
  }

pub const position_token_name =
  concat(
    loan_req_collateral_utxo.output_reference.transaction_id,
    string.from_int(loan_req_collateral_utxo.output_reference.output_index)
      |> string.to_bytearray(),
  )
    |> sha3_256()

pub const position_token_value =
  from_asset(lending_pool_script_hash, position_token_name, 1)

pub const position_token_bad_name =
  concat(
    loan_req_collateral_utxo.output_reference.transaction_id,
    string.from_int(69)
      |> string.to_bytearray(),
  )
    |> sha3_256()

pub const position_token_bad_value =
  from_asset(lending_pool_script_hash, position_token_bad_name, 1)

pub const pool_datum =
  LendingPoolDatum { loanable_asset, collateral_asset, interest_rates }

pub const starting_reserve_amt = 1_000_000_000_000

/// Lending pool UTXO to be used for fulfilling a loan request
pub const pool_input_for_loan_issue =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_0,
      output_index: 4,
    },
    output: Output {
      address: lending_pool_script_address,
      value: from_lovelace(2_000_000)
        |> merge(
            from_asset(
              loanable_asset.policy_id,
              loanable_asset.asset_name,
              starting_reserve_amt,
            ),
          ),
      datum: InlineDatum(pool_datum),
      reference_script: None,
    },
  }

/// Lending pool UTXO _after_ being used to fulfill a loan request
pub const pool_output_after_loan_issue =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_2,
      output_index: 0,
    },
    output: Output {
      address: lending_pool_script_address,
      value: from_lovelace(2_000_000)
        |> merge(
            from_asset(
              loanable_asset.policy_id,
              loanable_asset.asset_name,
              starting_reserve_amt - loan_amt,
            ),
          ),
      datum: InlineDatum(pool_datum),
      reference_script: None,
    },
  }

pub const loan_issued_collateral_value =
  from_lovelace(collateral_amt)
    |> merge(position_token_value)

pub const loan_issued_collateral_bad_value =
  from_lovelace(collateral_amt)
    |> merge(position_token_bad_value)

pub const loan_issued_collateral_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_2,
      output_index: 1,
    },
    output: Output {
      address: collateral_script_address,
      value: loan_issued_collateral_value,
      datum: InlineDatum(loan_issued_collateral_datum),
      reference_script: None,
    },
  }

pub const loan_issued_datum =
  LoanDatum {
    collateral_asset,
    borrowed_asset: loanable_asset,
    collateral_amt,
    borrowed_amt: loan_amt,
    interest_amt,
    loan_term,
    maturity: maturity_time,
  }

pub const position_registry_datum =
  PositionRegistryDatum {
    borrower: user_address,
    loan: loan_issued_datum,
    pos_id: position_token_name,
    liquidator: None,
  }

pub const registry_position_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_2,
      output_index: 2,
    },
    output: Output {
      address: registry_script_address,
      value: from_lovelace(1_000_000)
        |> merge(position_token_value),
      datum: InlineDatum(position_registry_datum),
      reference_script: None,
    },
  }

/// Suppose we have ADA as our collateral, and that the price is 0.55 USDM
/// ([`CollateralPrice`](./types.html#CollateralPrice))
pub const collateral_price: CollateralPrice = (550_000, 6)

/// timestamp: Jun 23, 2025 6:51:43 AM GMT, in [`PosixTime`](./types.html#PosixTime)
/// validity_period: 1 hr, in [`PosixTime`](./types.html#PosixTime)
/// price: 0.55 USDM
pub const oracle_price_datum =
  OracleDatum {
    timestamp: 1_750_661_503_000,
    validity_period: 3_600_000,
    quoted_asset: collateral_asset,
    denomination: loanable_asset,
    price: collateral_price,
    consumers: [],
  }

pub const oracle_price_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_0,
      output_index: 6,
    },
    output: Output {
      address: oracle_script_address,
      value: from_lovelace(1_500_000)
        |> merge(from_asset(oracle_script_hash, oracle_price_token, 1)),
      datum: InlineDatum(oracle_price_datum),
      reference_script: None,
    },
  }

pub const borrow_tx_valid_til = maturity_time - loan_term

pub const borrow_tx_valid_from = borrow_tx_valid_til - max_tx_validity

/// Sample tx that successfully fulfills a loan request
pub const tx_borrow_process =
  Transaction {
    ..placeholder,
    mint: merge(position_token_value, position_token_value),
    inputs: [loan_req_collateral_utxo, pool_input_for_loan_issue],
    reference_inputs: [oracle_price_utxo, global_cfg_utxo],
    outputs: [
      loan_issued_collateral_utxo.output,
      pool_output_after_loan_issue.output,
      registry_position_utxo.output,
    ],
    validity_range: interval.between(borrow_tx_valid_from, borrow_tx_valid_til),
  }

pub const redeemer_borrow_process =
  BorrowProcess {
    collateral_idxs: (0, 0),
    pool_idxs: (1, 1),
    oracle_idx: 0,
    cfg_idx: 1,
    registry_output_idx: 2,
  }

pub const repay_requested_collateral_datum =
  CollateralDatum {
    owner: user_address,
    collateral_asset,
    status: RepayRequested,
  }

pub const repay_req_collateral_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_3,
      output_index: 0,
    },
    output: Output {
      address: collateral_script_address,
      value: from_lovelace(collateral_amt)
        |> merge(position_token_value)
        |> merge(
            from_asset(
              loanable_asset.policy_id,
              loanable_asset.asset_name,
              loan_amt + interest_amt,
            ),
          ),
      datum: InlineDatum(repay_requested_collateral_datum),
      reference_script: None,
    },
  }

pub const repay_req_bad_collateral_utxo =
  Input {
    ..repay_req_collateral_utxo,
    output: Output {
      ..repay_req_collateral_utxo.output,
      value: repay_req_collateral_utxo.output.value
        |> merge(negate(position_token_value))
        |> merge(position_token_bad_value),
    },
  }

/// Sample tx that successfully submits a loan repayment request
pub const tx_repay_request =
  Transaction {
    ..placeholder,
    inputs: [loan_issued_collateral_utxo],
    reference_inputs: [registry_position_utxo, global_cfg_utxo],
    outputs: [repay_req_collateral_utxo.output],
    extra_signatories: [user_payment_keyhash],
  }

pub const redeemer_repay_req =
  RepayRequest { collateral_idxs: (0, 0), registry_idx: 0, cfg_idx: 1 }

/// Lending pool UTXO _after_ fulfilling a loan repayment request
pub const pool_output_after_loan_repayment =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_4,
      output_index: 1,
    },
    output: Output {
      address: lending_pool_script_address,
      value: from_lovelace(1_000_000_000)
        |> merge(
            from_asset(
              loanable_asset.policy_id,
              loanable_asset.asset_name,
              starting_reserve_amt + interest_amt,
            ),
          ),
      datum: InlineDatum(pool_datum),
      reference_script: None,
    },
  }

pub const repay_tx_valid_til = maturity_time - 1

pub const repay_tx_valid_from = repay_tx_valid_til - max_tx_validity

/// Sample tx that successfully fulfills a loan repayment request
pub const tx_repay_process =
  Transaction {
    ..placeholder,
    mint: merge(negate(position_token_value), negate(position_token_value)),
    inputs: [
      repay_req_collateral_utxo, pool_output_after_loan_issue,
      registry_position_utxo,
    ],
    reference_inputs: [global_cfg_utxo],
    outputs: [
      available_collateral_utxo.output,
      pool_output_after_loan_repayment.output,
    ],
    validity_range: interval.between(repay_tx_valid_from, repay_tx_valid_til),
  }

pub const redeemer_repay_process =
  RepayProcess {
    collateral_idxs: (0, 0),
    pool_idxs: (1, 1),
    cfg_idx: 0,
    registry_input_idx: 2,
  }

pub const minswap_lp_asset =
  AssetClass {
    policy_id: #"f5808c2c990d86da54bfc97d89cee6efa20cd8461616359478d96b4c",
    asset_name: #"73e1518e92f367fd5820ac2da1d40ab24fbca1d6cb2c28121ad92f57aff8abce",
  }

pub const registry_datum_after_liquidation =
  PositionRegistryDatum {
    borrower: user_address,
    loan: loan_issued_datum,
    pos_id: position_token_name,
    liquidator: Some(liquidator_keyhash),
  }

pub const bad_registry_datum_after_liquidation =
  PositionRegistryDatum {
    borrower: user_address,
    loan: loan_issued_datum,
    pos_id: position_token_bad_name,
    liquidator: Some(liquidator_keyhash),
  }

pub const registry_utxo_from_liquidation =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_5,
      output_index: 0,
    },
    output: Output {
      address: registry_script_address,
      value: merge(registry_position_utxo.output.value, position_token_value),
      datum: InlineDatum(registry_datum_after_liquidation),
      reference_script: None,
    },
  }

pub const minswap_extra_order_datum =
  MinEODDatumHash {
    hash: blake2b_256(serialise_data(registry_datum_after_liquidation)),
  }

pub const bad_minswap_extra_order_datum =
  MinEODDatumHash {
    hash: blake2b_256(serialise_data(bad_registry_datum_after_liquidation)),
  }

pub const minswap_order_datum =
  MinswapOrderDatum {
    canceller: OAMSignature { pub_key_hash: admin_key_hash },
    refund_receiver: collateral_script_address,
    refund_receiver_datum: minswap_extra_order_datum,
    success_receiver: collateral_script_address,
    success_receiver_datum: minswap_extra_order_datum,
    lp_asset: minswap_lp_asset,
    step: SwapExactIn {
      a_to_b_direction: True,
      swap_amount_option: SAOSpecificAmount {
        swap_amount: lovelace_of(loan_issued_collateral_utxo.output.value),
      },
      // Minimum amount of Asset Out which users want to receive after exchanging
      minimum_receive: 0,
      // Decide the Order behavior in case Order is not meet the slippage tolerance
      killable: True,
    },
    max_batcher_fee: 3_000_000,
    expiry_setting_opt: None,
  }

pub const bad_minswap_order_datum =
  MinswapOrderDatum {
    ..minswap_order_datum,
    refund_receiver_datum: bad_minswap_extra_order_datum,
    success_receiver_datum: bad_minswap_extra_order_datum,
  }

pub const liquidation_dex_output =
  Output {
    address: minswap_order_address,
    value: loan_issued_collateral_utxo.output.value
      |> merge(negate(position_token_value)),
    datum: InlineDatum(minswap_order_datum),
    reference_script: None,
  }

pub const liquidation_tx_valid_from = maturity_time + 1

pub const liquidation_tx_valid_til = liquidation_tx_valid_from + max_tx_validity

/// Sample tx that successfully liquidates collateral
pub const tx_liquidate_collateral =
  Transaction {
    ..placeholder,
    inputs: [loan_issued_collateral_utxo, registry_position_utxo],
    reference_inputs: [oracle_price_utxo, global_cfg_utxo],
    outputs: [registry_utxo_from_liquidation.output, liquidation_dex_output],
    validity_range: interval.between(
      liquidation_tx_valid_from,
      liquidation_tx_valid_til,
    ),
    extra_signatories: [liquidator_keyhash],
  }

pub const redeemer_liquidate_collateral =
  LiquidateCollateral {
    collateral_input_idx: 0,
    registry_idxs: (1, 0),
    dex_output_idx: 1,
    oracle_idx: 0,
    cfg_idx: 1,
    liquidation_dex: Minswap { order_contract: minswap_script_hash },
    liquidator: liquidator_keyhash,
  }

const price = collateral_price.1st

const decimals = collateral_price.2nd

const price_denom = pow(10, decimals)

/// Sample utxo from an executed dex swap order 
pub const collateral_swapped_amt =
  multiply_integer(collateral_amt, price) |> quotient_integer(price_denom)

pub const liquidated_collateral_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_5,
      output_index: 1,
    },
    output: Output {
      address: collateral_script_address,
      value: merge(
        from_lovelace(2_000_000),
        from_asset(
          loanable_asset.policy_id,
          loanable_asset.asset_name,
          collateral_swapped_amt,
        ),
      ),
      datum: DatumHash(
        blake2b_256(serialise_data(registry_datum_after_liquidation)),
      ),
      reference_script: None,
    },
  }

pub const pool_output_after_liquidation_settlement =
  Input {
    ..pool_output_after_loan_repayment,
    output_reference: OutputReference {
      transaction_id: txid_5,
      output_index: 2,
    },
  }

/// Sample tx that successfully settles a loan after liquidating the collateral
pub const tx_settle_liquidation =
  Transaction {
    ..placeholder,
    mint: negate(merge(position_token_value, position_token_value)),
    inputs: [
      liquidated_collateral_utxo, registry_utxo_from_liquidation,
      pool_output_after_loan_issue,
    ],
    reference_inputs: [global_cfg_utxo],
    outputs: [pool_output_after_liquidation_settlement.output],
    extra_signatories: [liquidator_keyhash],
  }

pub const redeemer_settle_liquidation =
  SettleLiquidation {
    collateral_input_idx: 0,
    registry_input_idx: 1,
    pool_idxs: (2, 0),
    cfg_idx: 0,
  }

/// Sample tx that successfully updates the global settings datum
pub const tx_update_global_settings =
  Transaction {
    ..placeholder,
    inputs: [global_cfg_utxo],
    outputs: [global_cfg_utxo.output],
    extra_signatories: [admin_key_hash],
  }

pub const redeemer_update_global_settings =
  UpdateGlobalCfg { input_idx: 0, output_idx: 0 }

/// Sample tx that successfully updates the oracle settings datum
pub const tx_update_oracle_settings =
  Transaction {
    ..placeholder,
    inputs: [oracle_cfg_utxo],
    reference_inputs: [global_cfg_utxo],
    outputs: [oracle_cfg_utxo.output],
    extra_signatories: [admin_key_hash],
  }

pub const redeemer_update_oracle_settings =
  UpdateOracleCfg { global_cfg_idx: 0, oracle_cfg_idxs: (0, 0) }

/// Sample tx that successfully mints an oracle price beacon token
pub const tx_mint_oracle_price_beacon =
  Transaction {
    ..placeholder,
    mint: from_asset(oracle_script_hash, oracle_price_token, 1),
    inputs: [admin_utxo],
    reference_inputs: [global_cfg_utxo],
    outputs: [oracle_price_utxo.output],
    extra_signatories: [admin_key_hash],
  }

pub const redeemer_mint_oracle_beacon = MintOracleBeacon { cfg_idx: 0 }

/// Sample tx that successfully burns an oracle price beacon token
pub const tx_burn_oracle_price_beacon =
  Transaction {
    ..placeholder,
    mint: from_asset(oracle_script_hash, oracle_price_token, -1),
    inputs: [oracle_price_utxo],
    reference_inputs: [global_cfg_utxo],
    outputs: [admin_utxo.output],
    extra_signatories: [admin_key_hash],
  }

pub const redeemer_burn_oracle_beacon = BurnOracleBeacon { cfg_idx: 0 }

/// Sample tx that successfully updates the oracle price datum
pub const tx_oracle_update_price =
  Transaction {
    ..placeholder,
    inputs: [oracle_price_utxo],
    reference_inputs: [oracle_cfg_utxo],
    outputs: [oracle_price_utxo.output],
    extra_signatories: [oracle_provider1_keyhash],
  }

pub const redeemer_oracle_update_price =
  UpdateOraclePrice {
    price_idxs: (0, 0),
    cfg_idx: 0,
    provider: oracle_provider1_keyhash,
  }

pub const admin_utxo_after_lp_withdrawal =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_8,
      output_index: 0,
    },
    output: Output {
      address: admin_address,
      value: pool_output_after_loan_repayment.output.value,
      datum: NoDatum,
      reference_script: None,
    },
  }

/// Sample tx that successfully withdraws the loanable asset from the lending_pool
pub const tx_withdraw_lp =
  Transaction {
    ..placeholder,
    inputs: [pool_output_after_loan_repayment],
    reference_inputs: [global_cfg_utxo],
    outputs: [admin_utxo_after_lp_withdrawal.output],
    extra_signatories: [admin_key_hash],
  }

pub const redeemer_withdraw_lp =
  WithdrawLendingPool { pool_input_idx: 0, cfg_idx: 0 }

pub const initial_audit_datum =
  AuditDatum {
    timestamp: 0,
    collateral_asset: pool_datum.collateral_asset,
    loanable_asset: pool_datum.loanable_asset,
    collateral_ratio,
    total_collateral: 0,
    total_borrowed: 0,
    health_score: (0, 0),
    utilization_rate: (0, 0),
  }

pub const audit_total_collateral = 100_000_000_000

pub const audit_total_borrowed = 30_000_000_000

const audit_total_can_borrow =
  multiply_integer(audit_total_collateral, collateral_price.1st)
    |> quotient_integer(pow(10, collateral_price.2nd))
    |> multiply_integer(collateral_ratio)
    |> quotient_integer(100)

pub const new_audit_datum =
  AuditDatum {
    timestamp: oracle_price_datum.timestamp + 1_000_000,
    collateral_asset: pool_datum.collateral_asset,
    loanable_asset: pool_datum.loanable_asset,
    collateral_ratio,
    total_collateral: audit_total_collateral,
    total_borrowed: audit_total_borrowed,
    health_score: (audit_total_can_borrow, audit_total_borrowed),
    utilization_rate: (47, 100),
  }

pub const init_audit_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_7,
      output_index: 1,
    },
    output: Output {
      address: audit_script_address,
      value: beacon_token_audit_value,
      datum: InlineDatum(initial_audit_datum),
      reference_script: None,
    },
  }

pub const new_audit_utxo =
  Input {
    output_reference: OutputReference {
      transaction_id: txid_8,
      output_index: 1,
    },
    output: Output {
      address: audit_script_address,
      value: beacon_token_audit_value,
      datum: InlineDatum(new_audit_datum),
      reference_script: None,
    },
  }

pub const audit_tx_valid_from = oracle_price_datum.timestamp

pub const audit_tx_valid_til = audit_tx_valid_from + max_tx_validity

/// Sample tx that successfully updates the audit datum
pub const tx_update_audit =
  Transaction {
    ..placeholder,
    inputs: [init_audit_utxo],
    reference_inputs: [
      global_cfg_utxo, oracle_cfg_utxo, pool_output_after_loan_issue,
      oracle_price_utxo,
    ],
    outputs: [new_audit_utxo.output],
    extra_signatories: [oracle_provider1_keyhash],
    validity_range: interval.between(audit_tx_valid_from, audit_tx_valid_til),
  }

pub const redeemer_update_audit =
  UpdateAuditDatum {
    audit_idxs: (0, 0),
    gcfg_idx: 0,
    ocfg_idx: 1,
    pool_idx: 2,
    oracle_idx: 3,
    provider: oracle_provider1_keyhash,
  }

pub const unreg_settings_cred_cert =
  UnregisterCredential {
    credential: Script(settings_script_hash),
    refund: Never,
  }

/// Sample tx that successfully burns the beacon tokens for the protocol's settings
pub const tx_burn_beacon_tokens =
  Transaction {
    ..placeholder,
    mint: negate(
      merge(beacon_token_global_cfg_value, beacon_token_oracle_cfg_value)
        |> merge(beacon_token_audit_value),
    ),
    inputs: [global_cfg_utxo, oracle_cfg_utxo, new_audit_utxo],
    outputs: [],
    withdrawals: [Pair(Script(settings_script_hash), 0)],
    certificates: [unreg_settings_cred_cert],
    extra_signatories: [admin_key_hash],
  }

pub const redeemer_burn_cfg_beacons =
  BurnSettingsBeacons { glob_cfg_utxo_idx: 0 }
