//// Validator to hold the `audit` utxo containing protocol-wide health score and other metrics

use aiken/collection/list
use aiken/collection/pairs
use aiken/crypto.{ScriptHash}
use cardano/address.{Script}
use cardano/assets.{quantity_of}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction,
}
use constants.{audit_token}
use helpers.{
  get_gcfg, get_ocfg, is_cfg_utxo_returned, read_oracle_data,
  validate_audit_output,
}
use test_constants as tc
use types.{
  AuditDatum, BurnSettingsBeacons, LendingPoolDatum, UnifiedRedeemer,
  UpdateAuditDatum,
}
use utils.{is_signed_by}

validator audit(settings_script: ScriptHash) {
  spend(
    _datum: Option<Data>,
    redeemer: UnifiedRedeemer,
    output_ref: OutputReference,
    this_tx: Transaction,
  ) {
    when redeemer is {
      UpdateAuditDatum {
        audit_idxs,
        gcfg_idx,
        ocfg_idx,
        pool_idx,
        oracle_idx,
        provider,
      } -> {
        expect Some(input) = list.at(this_tx.inputs, audit_idxs.1st)
        expect input.output_reference == output_ref
        let has_audit_token =
          1 == quantity_of(input.output.value, settings_script, audit_token)

        // get global config settings
        let gcfg = get_gcfg(this_tx.reference_inputs, gcfg_idx, settings_script)

        expect Some(output) = list.at(this_tx.outputs, audit_idxs.2nd)
        expect Some(pool_input) = list.at(this_tx.reference_inputs, pool_idx)
        expect
          Script(gcfg.pool_contract) == pool_input.output.address.payment_credential
        expect InlineDatum(pool_inline_datum) = pool_input.output.datum
        expect pool_datum: LendingPoolDatum = pool_inline_datum

        // get current price from oracle data
        expect Some(oracle_input) =
          list.at(this_tx.reference_inputs, oracle_idx)
        let (price, oracle_data_valid) =
          read_oracle_data(
            oracle_input,
            pool_datum.collateral_asset,
            pool_datum.loanable_asset,
            this_tx.validity_range,
            gcfg.oracle_contract,
          )

        // validate audit output
        let tx_range = this_tx.validity_range
        let audit_output_valid =
          validate_audit_output(
            input,
            output,
            gcfg,
            price,
            pool_datum,
            tx_range,
          )

        let audit_utxo_returned = is_cfg_utxo_returned(input, output)

        // get oracle config settings and check that the tx is signed by one of
        // the trusted providers
        let ocfg = get_ocfg(this_tx.reference_inputs, ocfg_idx, settings_script)
        let signed_by_trusted_provider = and {
            list.has(ocfg.providers, provider),
            is_signed_by(this_tx.extra_signatories, provider),
          }
        and {
          has_audit_token?,
          audit_output_valid?,
          oracle_data_valid?,
          audit_utxo_returned?,
          signed_by_trusted_provider?,
        }
      }
      BurnSettingsBeacons { glob_cfg_utxo_idx } -> {
        expect Some(gcfg_input) = list.at(this_tx.inputs, glob_cfg_utxo_idx)
        expect Script(gcfg_hash) = gcfg_input.output.address.payment_credential
        expect gcfg_hash == settings_script
        let in_withdrawals =
          pairs.has_key(this_tx.withdrawals, Script(gcfg_hash))
        in_withdrawals?
      }
      _ -> fail @"Unsupported redeemer for audit spend validator"
    }
  }

  /// Unsupported validator purpose
  else(_ctx) {
    fail @"Unsupported purpose for audit validator"
  }
}

/// Test for `UpdateAuditDatum` redeemer
test update_audit_succeed() {
  let datum_as_data: Data = tc.initial_audit_datum
  let redeemer = tc.redeemer_update_audit
  let output_ref = tc.init_audit_utxo.output_reference

  audit.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_update_audit,
  )
}

/// Fail test for `UpdateAuditDatum` redeemer
///
/// Fail point: miscalculated health score
test update_audit_fail() fail {
  let datum_as_data: Data = tc.initial_audit_datum
  let redeemer = tc.redeemer_update_audit
  let output_ref = tc.init_audit_utxo.output_reference

  let wrong_health_score = (40_000_000_000, tc.audit_total_borrowed)
  let bad_audit_datum =
    AuditDatum { ..tc.new_audit_datum, health_score: wrong_health_score }
  let bad_audit_output =
    Output { ..tc.new_audit_utxo.output, datum: InlineDatum(bad_audit_datum) }

  audit.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction { ..tc.tx_update_audit, outputs: [bad_audit_output] },
  )
}

/// Test for `BurnSettingsBeacons` redeemer on `spend` purpose
test burn_beacons_succeed() {
  let datum_as_data: Data = tc.new_audit_datum
  let redeemer = tc.redeemer_burn_cfg_beacons
  let output_ref = tc.new_audit_utxo.output_reference

  audit.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_burn_beacon_tokens,
  )
}

/// Fail test for `BurnSettingsBeacons` redeemer on `spend` purpose
///
/// Fail point: tx.withdrawals does not contain withdrawal from settings script cred
test burn_beacons_fail() fail {
  let datum_as_data: Data = tc.new_audit_datum
  let redeemer = tc.redeemer_burn_cfg_beacons
  let output_ref = tc.new_audit_utxo.output_reference

  audit.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction { ..tc.tx_burn_beacon_tokens, withdrawals: [] },
  )
}
