//// Validator to hold the UTXOs containing the protocol's settings

use aiken/collection/list
use aiken/collection/pairs
use cardano/address.{Credential, Script}
use cardano/assets.{PolicyId, merge, negate, quantity_of}
use cardano/certificate.{Certificate, RegisterCredential, UnregisterCredential}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use constants.{global_cfg_token, oracle_cfg_token}
use helpers.{
  are_cfg_beacons_burned, are_cfg_beacons_minted, get_global_settings_from_input,
  is_cfg_utxo_returned,
}
use test_constants as tc
use types.{
  BurnSettingsBeacons, CfgGlobal, MintSettingsBeacons, OracleSettings,
  SettingsDatum, UnifiedRedeemer, UpdateGlobalCfg, UpdateOracleCfg,
}
use utils.{is_signed_by}

validator settings(init_output_ref: OutputReference) {
  mint(redeemer: UnifiedRedeemer, this_policy: PolicyId, tx: Transaction) {
    when redeemer is {
      MintSettingsBeacons { init_utxo_idx } -> {
        let init_utxo_in_inputs =
          when list.at(tx.inputs, init_utxo_idx) is {
            Some(input) -> input.output_reference == init_output_ref
            _ -> fail @"Init utxo not found in tx inputs"
          }
        let beacon_tokens_minted = are_cfg_beacons_minted(tx.mint, this_policy)
        and {
          init_utxo_in_inputs?,
          beacon_tokens_minted?,
        }
      }
      BurnSettingsBeacons { .. } -> {
        let in_withdrawals = pairs.has_key(tx.withdrawals, Script(this_policy))
        in_withdrawals?
      }
      _ -> fail @"Invalid mint/burn redeemer for settings beacon token"
    }
  }

  spend(
    _datum: Option<Data>,
    redeemer: UnifiedRedeemer,
    output_ref: OutputReference,
    tx: Transaction,
  ) {
    when redeemer is {
      UpdateGlobalCfg { input_idx, output_idx } -> {
        expect Some(input) = list.at(tx.inputs, input_idx)
        expect Some(output) = list.at(tx.outputs, output_idx)
        expect input.output_reference == output_ref
        expect Script(script_hash) = input.output.address.payment_credential
        let cfg = get_global_settings_from_input(input)
        let has_global_cfg_token =
          1 == quantity_of(input.output.value, script_hash, global_cfg_token)
        let cfg_utxo_returned = is_cfg_utxo_returned(input, output)
        let signed_by_admin =
          is_signed_by(tx.extra_signatories, cfg.admin_key_hash)

        and {
          has_global_cfg_token?,
          cfg_utxo_returned?,
          signed_by_admin?,
        }
      }
      UpdateOracleCfg { global_cfg_idx, oracle_cfg_idxs } -> {
        expect Some(oracle_cfg_input) = list.at(tx.inputs, oracle_cfg_idxs.1st)
        expect oracle_cfg_input.output_reference == output_ref
        expect Script(cfg_policy_id) =
          oracle_cfg_input.output.address.payment_credential
        expect Some(global_cfg_input) =
          list.at(tx.reference_inputs, global_cfg_idx)

        let has_global_cfg_token =
          quantity_of(
            global_cfg_input.output.value,
            cfg_policy_id,
            global_cfg_token,
          ) == 1
        let has_oracle_cfg_token =
          quantity_of(
            oracle_cfg_input.output.value,
            cfg_policy_id,
            oracle_cfg_token,
          ) == 1
        expect Some(oracle_cfg_output) =
          list.at(tx.outputs, oracle_cfg_idxs.2nd)
        let oracle_cfg_utxo_returned =
          is_cfg_utxo_returned(oracle_cfg_input, oracle_cfg_output)
        let oracle_cfg_datum_valid =
          when oracle_cfg_output.datum is {
            InlineDatum(inline_datum) -> {
              expect inline_datum: SettingsDatum = inline_datum
              when inline_datum is {
                OracleSettings { .. } -> True
                _ -> False
              }
            }
            _ -> False
          }

        let CfgGlobal { admin_key_hash, .. } =
          get_global_settings_from_input(global_cfg_input)
        let signed_by_admin = is_signed_by(tx.extra_signatories, admin_key_hash)

        and {
          has_global_cfg_token?,
          has_oracle_cfg_token?,
          oracle_cfg_utxo_returned?,
          oracle_cfg_datum_valid?,
          signed_by_admin?,
        }
      }
      BurnSettingsBeacons { glob_cfg_utxo_idx } -> {
        expect Some(input) = list.at(tx.inputs, glob_cfg_utxo_idx)
        let own_credential = input.output.address.payment_credential
        let in_withdrawals = pairs.has_key(tx.withdrawals, own_credential)
        in_withdrawals?
      }

      _ -> fail @"Unsupported redeemer for settings spend validator"
    }
  }

  withdraw(redeemer: UnifiedRedeemer, own_cred: Credential, tx: Transaction) {
    when redeemer is {
      BurnSettingsBeacons { glob_cfg_utxo_idx } -> {
        expect Some(input) = list.at(tx.inputs, glob_cfg_utxo_idx)
        expect Script(cfg_policy_id) = own_cred
        let cfg = get_global_settings_from_input(input)
        let beacon_tokens_burned =
          are_cfg_beacons_burned(tx.mint, cfg_policy_id)
        let signed_by_admin =
          is_signed_by(tx.extra_signatories, cfg.admin_key_hash)
        and {
          beacon_tokens_burned?,
          signed_by_admin?,
        }
      }
      _ -> fail @"Unsupported redeemer for oracle withdraw validator"
    }
  }

  publish(redeemer: UnifiedRedeemer, cert: Certificate, tx: Transaction) {
    when redeemer is {
      BurnSettingsBeacons { .. } ->
        when cert is {
          RegisterCredential { credential, .. } |
          UnregisterCredential { credential, .. } -> {
            expect Script(own_hash) = credential
            expect Some(gcfg_input) =
              list.find(
                tx.inputs,
                fn(input) {
                  1 == quantity_of(
                    input.output.value,
                    own_hash,
                    global_cfg_token,
                  )
                },
              )
            let cfg = get_global_settings_from_input(gcfg_input)
            let signed_by_admin =
              is_signed_by(tx.extra_signatories, cfg.admin_key_hash)
            signed_by_admin?
          }
          _ ->
            fail @"Unsupported certificate type for settings publish validator"
        }
      _ -> fail @"Unsupported redeemer for settings publish validator"
    }
  }

  else(_) {
    fail @"Unsupported purpose for settings validator"
  }
}

/// Test for `MintSettingsBeacons` redeemer
test init_mint_succeed() {
  let redeemer = tc.redeemer_init_mint

  settings.mint(
    tc.init_utxo.output_reference,
    redeemer,
    tc.settings_script_hash,
    tc.tx_init_protocol,
  )
}

/// Fail test for `MintSettingsBeacons` redeemer
///
/// Fail point: init utxo specified in validator params is not one of the inputs
test init_mint_fail() fail {
  let redeemer = tc.redeemer_init_mint

  settings.mint(
    tc.init_utxo.output_reference,
    redeemer,
    tc.settings_script_hash,
    Transaction { ..tc.tx_init_protocol, inputs: [tc.admin_utxo] },
  )
}

/// Test for `BurnSettingsBeacons` redeemer on `mint` purpose
test burn_cfg_beacons_succeed() {
  let redeemer = tc.redeemer_burn_cfg_beacons

  settings.mint(
    tc.init_utxo.output_reference,
    redeemer,
    tc.settings_script_hash,
    tc.tx_burn_beacon_tokens,
  )
}

/// Fail test for `BurnSettingsBeacons` redeemer on `mint` purpose
///
/// Fail point: tx.withdrawals does not contain withdrawal from settings script cred
test burn_cfg_beacons_fail() fail {
  let redeemer = tc.redeemer_burn_cfg_beacons

  settings.mint(
    tc.init_utxo.output_reference,
    redeemer,
    tc.settings_script_hash,
    Transaction { ..tc.tx_burn_beacon_tokens, withdrawals: [] },
  )
}

/// Test for `BurnSettingsBeacons` redeemer on `spend` purpose
test spend_burn_cfg_beacons_succeed() {
  let redeemer = tc.redeemer_burn_cfg_beacons

  settings.spend(
    tc.init_utxo.output_reference,
    None,
    redeemer,
    tc.global_cfg_utxo.output_reference,
    tc.tx_burn_beacon_tokens,
  )
}

/// Fail test for `BurnSettingsBeacons` redeemer on `spend` purpose
///
/// Fail point: tx.withdrawals does not contain withdrawal from settings script cred
test spend_burn_cfg_beacons_fail() fail {
  let redeemer = tc.redeemer_burn_cfg_beacons

  settings.spend(
    tc.init_utxo.output_reference,
    None,
    redeemer,
    tc.global_cfg_utxo.output_reference,
    Transaction { ..tc.tx_burn_beacon_tokens, withdrawals: [] },
  )
}

/// Test for `BurnSettingsBeacons` redeemer on `withdraw` purpose
test withdraw_burn_cfg_beacons_succeed() {
  let redeemer = tc.redeemer_burn_cfg_beacons

  settings.withdraw(
    tc.init_utxo.output_reference,
    redeemer,
    Script(tc.settings_script_hash),
    tc.tx_burn_beacon_tokens,
  )
}

/// Fail test for `BurnSettingsBeacons` redeemer on `withdraw` purpose
///
/// Fail point: tx not signed by admin
test withdraw_burn_cfg_beacons_fail() fail {
  let redeemer = tc.redeemer_burn_cfg_beacons

  settings.withdraw(
    tc.init_utxo.output_reference,
    redeemer,
    Script(tc.settings_script_hash),
    Transaction { ..tc.tx_burn_beacon_tokens, extra_signatories: [] },
  )
}

/// Test for `BurnSettingsBeacons` redeemer on `publish` purpose
test publish_unreg_cfg_cred_succeed() {
  let redeemer = tc.redeemer_burn_cfg_beacons

  settings.publish(
    tc.init_utxo.output_reference,
    redeemer,
    tc.unreg_settings_cred_cert,
    tc.tx_burn_beacon_tokens,
  )
}

/// Fail test for `BurnSettingsBeacons` redeemer on `publish` purpose
///
/// Fail point: tx not signed by admin
test publish_unreg_cfg_cred_fail() fail {
  let redeemer = tc.redeemer_burn_cfg_beacons

  settings.publish(
    tc.init_utxo.output_reference,
    redeemer,
    tc.unreg_settings_cred_cert,
    Transaction { ..tc.tx_burn_beacon_tokens, extra_signatories: [] },
  )
}

/// Test for `UpdateGlobalCfg` redeemer on `spend` purpose
test update_global_cfg_succeed() {
  let redeemer = tc.redeemer_update_global_settings
  let output_ref = tc.global_cfg_utxo.output_reference

  settings.spend(
    tc.init_utxo.output_reference,
    None,
    redeemer,
    output_ref,
    tc.tx_update_global_settings,
  )
}

/// Fail test for `UpdateGlobalCfg` redeemer on `spend` purpose
///
/// Fail point: output global settings UTXO does not contain global settings beacon token
test update_global_cfg_fail() fail {
  let redeemer = tc.redeemer_update_global_settings
  let output_ref = tc.global_cfg_utxo.output_reference

  let bad_output =
    Output {
      ..tc.global_cfg_utxo.output,
      value: tc.global_cfg_utxo.output.value
        |> merge(negate(tc.beacon_token_global_cfg_value)),
    }

  settings.spend(
    tc.init_utxo.output_reference,
    None,
    redeemer,
    output_ref,
    Transaction { ..tc.tx_update_global_settings, outputs: [bad_output] },
  )
}

/// Test for `UpdateOracleCfg` redeemer on `spend` purpose
test update_oracle_cfg_succeed() {
  let redeemer = tc.redeemer_update_oracle_settings
  let output_ref = tc.oracle_cfg_utxo.output_reference

  settings.spend(
    tc.init_utxo.output_reference,
    None,
    redeemer,
    output_ref,
    tc.tx_update_oracle_settings,
  )
}

/// Fail test for `UpdateOracleCfg` redeemer on `spend` purpose
///
/// Fail point: output oracle settings datum does not contain `OracleSettings` structure
test update_oracle_cfg_fail() fail {
  let redeemer = tc.redeemer_update_oracle_settings
  let output_ref = tc.oracle_cfg_utxo.output_reference

  let bad_output =
    Output {
      ..tc.oracle_cfg_utxo.output,
      datum: tc.global_cfg_utxo.output.datum,
    }

  settings.spend(
    tc.init_utxo.output_reference,
    None,
    redeemer,
    output_ref,
    Transaction { ..tc.tx_update_oracle_settings, outputs: [bad_output] },
  )
}
