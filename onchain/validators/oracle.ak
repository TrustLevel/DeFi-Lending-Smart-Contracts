//// Validator to hold utxos containing updated price data for collateral assets

use aiken/collection/list
use aiken/crypto.{ScriptHash}
use cardano/assets.{PolicyId}
use cardano/transaction.{Input, OutputReference, Transaction}
use helpers.{get_gcfg, get_ocfg, validate_oracle_price_output}
use test_constants as tc
use types.{
  BurnOracleBeacon, MintOracleBeacon, UnifiedRedeemer, UpdateOraclePrice,
}
use utils.{is_signed_by}

validator oracle(settings_script: ScriptHash) {
  mint(redeemer: UnifiedRedeemer, _policy: PolicyId, this_tx: Transaction) {
    when redeemer is {
      // oracle beacon tokens can be minted/burned multiple times.
      // these tokens are used to tag oracle UTXOs containing updated price data.
      MintOracleBeacon { cfg_idx } |
      BurnOracleBeacon { cfg_idx } -> {
        // get global config settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        let signed_by_admin =
          is_signed_by(this_tx.extra_signatories, cfg.admin_key_hash)
        signed_by_admin?
      }
      _ -> fail @"Invalid mint/burn redeemer for oracle config beacon token"
    }
  }

  spend(
    _datum: Option<Data>,
    redeemer: UnifiedRedeemer,
    output_ref: OutputReference,
    this_tx: Transaction,
  ) {
    when redeemer is {
      UpdateOraclePrice { price_idxs, cfg_idx, provider } -> {
        expect Some(price_input) = list.at(this_tx.inputs, price_idxs.1st)
        expect price_input.output_reference == output_ref

        // check that the price UTXO is returned with the same value and the same datum structure
        expect Some(price_output) = list.at(this_tx.outputs, price_idxs.2nd)
        let price_output_valid =
          validate_oracle_price_output(price_input, price_output)

        // get oracle config settings
        let cfg = get_ocfg(this_tx.reference_inputs, cfg_idx, settings_script)

        // check that the tx is signed by one of the trusted providers
        let signed_by_trusted_provider = and {
            list.has(cfg.providers, provider),
            is_signed_by(this_tx.extra_signatories, provider),
          }
        and {
          price_output_valid?,
          signed_by_trusted_provider?,
        }
      }
      BurnOracleBeacon { cfg_idx } -> {
        // get global config settings
        let cfg = get_gcfg(this_tx.reference_inputs, cfg_idx, settings_script)

        let signed_by_admin =
          is_signed_by(this_tx.extra_signatories, cfg.admin_key_hash)
        signed_by_admin?
      }
      _ -> fail @"Unsupported redeemer for oracle spend validator"
    }
  }

  /// Unsupported validator purpose
  else(_ctx) {
    fail @"Unsupported purpose for oracle validator"
  }
}

/// Test for `MintOracleBeacon` redeemer on `mint` purpose
test mint_oracle_beacon_succeed() {
  oracle.mint(
    tc.settings_script_hash,
    tc.redeemer_mint_oracle_beacon,
    tc.oracle_script_hash,
    tc.tx_mint_oracle_price_beacon,
  )
}

/// Fail test for `MintOracleBeacon` redeemer on `mint` purpose
///
/// Fail point: admin did not sign the tx
test mint_oracle_beacon_fail() fail {
  oracle.mint(
    tc.settings_script_hash,
    tc.redeemer_mint_oracle_beacon,
    tc.oracle_script_hash,
    Transaction { ..tc.tx_mint_oracle_price_beacon, extra_signatories: [] },
  )
}

/// Test for `UpdateOraclePrice` redeemer on `spend` purpose
test update_price_succeed() {
  let datum_as_data: Data = tc.oracle_price_datum
  let redeemer = tc.redeemer_oracle_update_price
  let output_ref = tc.oracle_price_utxo.output_reference

  oracle.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_oracle_update_price,
  )
}

/// Fail test for `UpdateOraclePrice` redeemer on `spend` purpose
///
/// Fail point: tx not signed by a trusted provider
test update_price_fail() fail {
  let datum_as_data: Data = tc.oracle_price_datum
  let redeemer = tc.redeemer_oracle_update_price
  let output_ref = tc.oracle_price_utxo.output_reference

  oracle.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction { ..tc.tx_oracle_update_price, extra_signatories: [] },
  )
}

/// Test for `BurnOracleBeacon` redeemer on `spend` purpose
test burn_oracle_beacon_spend_succeed() {
  let datum_as_data: Data = tc.oracle_price_datum
  let redeemer = tc.redeemer_burn_oracle_beacon
  let output_ref = tc.oracle_price_utxo.output_reference

  oracle.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    tc.tx_burn_oracle_price_beacon,
  )
}

/// Fail test for `BurnOracleBeacon` redeemer on `spend` purpose
///
/// Fail point: tx not signed by admin
test burn_oracle_beacon_spend_fail() fail {
  let datum_as_data: Data = tc.oracle_price_datum
  let redeemer = tc.redeemer_burn_oracle_beacon
  let output_ref = tc.oracle_price_utxo.output_reference

  oracle.spend(
    tc.settings_script_hash,
    Some(datum_as_data),
    redeemer,
    output_ref,
    Transaction { ..tc.tx_burn_oracle_price_beacon, extra_signatories: [] },
  )
}
