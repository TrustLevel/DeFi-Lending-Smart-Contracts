//// Validator to hold utxos containing open loan positions metadata

use aiken/collection/list
use aiken/crypto.{ScriptHash}
use cardano/address.{Address, Script}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction,
}
use helpers.{get_gcfg, validate_collateral_registry_inputs_match}
use test_constants as tc
use types.{LiquidateCollateral,
  RepayProcess, SettleLiquidation, UnifiedRedeemer}

validator registry(settings_script: ScriptHash) {
  spend(
    _datum: Option<Data>,
    redeemer: UnifiedRedeemer,
    output_ref: OutputReference,
    this_tx: Transaction,
  ) {
    when redeemer is {
      RepayProcess { collateral_idxs, cfg_idx, registry_input_idx, .. } -> {
        // get global config settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        let collateral_input_valid =
          validate_collateral_registry_inputs_match(
            this_tx,
            registry_input_idx,
            collateral_idxs.1st,
            cfg.pool_contract,
            output_ref,
          )
        collateral_input_valid?
      }
      LiquidateCollateral { collateral_input_idx, registry_idxs, cfg_idx, .. } -> {
        // get global config settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        let collateral_input_valid =
          validate_collateral_registry_inputs_match(
            this_tx,
            registry_idxs.1st,
            collateral_input_idx,
            cfg.pool_contract,
            output_ref,
          )
        collateral_input_valid?
      }
      SettleLiquidation { pool_idxs, cfg_idx, .. } -> {
        // get global settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        // Require spending a utxo from lending_pool, to invoke validator functions there
        expect Some(pool_input) = list.at(this_tx.inputs, pool_idxs.1st)
        expect Script(pool_hash) = pool_input.output.address.payment_credential
        let has_pool_input = pool_hash == cfg.pool_contract
        has_pool_input?
      }
      _ -> fail @"Invalid redeemer for position_registry validator"
    }
  }

  /// Unsupported validator purpose
  else(_ctx) {
    fail @"Unsupported purpose for position_registry validator"
  }
}

/// Test for `RepayProcess` redeemer
test repay_proc_succeed() {
  let datum_as_data: Data = tc.position_registry_datum
  let redeemer = tc.redeemer_repay_process
  let output_ref = tc.registry_position_utxo.output_reference

  registry.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_repay_process,
  )
}

/// Fail test for `RepayProcess` redeemer
///
/// Fail point: wrong collateral input (does not contain the correct position token)
test repay_proc_fail() fail {
  let datum_as_data: Data = tc.position_registry_datum
  let redeemer = tc.redeemer_repay_process
  let output_ref = tc.registry_position_utxo.output_reference

  registry.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction {
      ..tc.tx_repay_process,
      inputs: [
        tc.repay_req_bad_collateral_utxo,
        tc.pool_output_after_loan_issue,
        tc.registry_position_utxo,
      ],
    },
  )
}

/// Test for `LiquidateCollateral` redeemer
test liquidate_succeed() {
  let datum_as_data: Data = tc.position_registry_datum
  let redeemer = tc.redeemer_liquidate_collateral
  let output_ref = tc.registry_position_utxo.output_reference

  registry.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_liquidate_collateral,
  )
}

/// Fail test for `LiquidateCollateral` redeemer
///
/// Fail point: wrong collateral input (does not contain the correct position token)
test liquidate_fail() fail {
  let datum_as_data: Data = tc.position_registry_datum
  let redeemer = tc.redeemer_liquidate_collateral
  let output_ref = tc.registry_position_utxo.output_reference

  let bad_collateral_input =
    Input {
      ..tc.loan_issued_collateral_utxo,
      output: Output {
        address: tc.collateral_script_address,
        value: tc.loan_issued_collateral_bad_value,
        datum: InlineDatum(tc.loan_issued_collateral_datum),
        reference_script: None,
      },
    }

  registry.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction {
      ..tc.tx_liquidate_collateral,
      inputs: [bad_collateral_input, tc.registry_position_utxo],
    },
  )
}

/// Test for `SettleLiquidation` redeemer
test settle_liquidation_succeed() {
  let datum_as_data: Data = tc.registry_datum_after_liquidation
  let redeemer = tc.redeemer_settle_liquidation
  let output_ref = tc.registry_utxo_from_liquidation.output_reference

  registry.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_settle_liquidation,
  )
}

/// Fail test for `SettleLiquidation` redeemer
///
/// Fail point: inputs do not include a UTXO from `lending_pool`
test settle_liquidation_fail() fail {
  let datum_as_data: Data = tc.registry_datum_after_liquidation
  let redeemer = tc.redeemer_settle_liquidation
  let output_ref = tc.registry_utxo_from_liquidation.output_reference

  registry.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction {
      ..tc.tx_settle_liquidation,
      inputs: [
        tc.liquidated_collateral_utxo,
        tc.registry_utxo_from_liquidation,
        tc.registry_position_utxo,
      ],
    },
  )
}
