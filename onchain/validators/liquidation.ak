//// Example liquidation validator for DeFi lending protocol templates
//// This validator demonstrates liquidation functionality that can be used
//// as a template for building DeFi lending protocols on Cardano.
//// 
//// Note: This is a standalone example and not integrated into the main protocol.

use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{ScriptHash, VerificationKeyHash}
use aiken/interval
use cardano/address.{Address, Script}
use cardano/assets.{PolicyId, AssetName, quantity_of, from_lovelace, from_asset, tokens}
use cardano/script_context.{ScriptContext}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction,
}

// Import types for liquidation functionality
pub type AssetClass {
  policy_id: PolicyId,
  asset_name: AssetName,
}

pub type PosixTime = Int

pub type LoanDatum {
  collateral_asset: AssetClass,
  borrowed_asset: AssetClass,
  collateral_amt: Int,
  borrowed_amt: Int,
  interest_amt: Int,
  loan_term: Int,
  maturity: PosixTime,
}

pub type CollateralStatus {
  Available
  LoanIssued
  Liquidated
}

pub type CollateralDatum {
  owner: Address,
  collateral_asset: AssetClass,
  status: CollateralStatus,
}

pub type PositionRegistryDatum {
  borrower: Address,
  loan: LoanDatum,
  pos_id: AssetName,
  liquidator: Option<VerificationKeyHash>,
}

pub type QuotePrice = (Int, Int)  // (price, decimal_digits)

pub type LiquidationDex {
  Minswap { order_contract: ScriptHash }
}

pub type LiquidationRedeemer {
  InitiateLiquidation {
    collateral_input_idx: Int,
    position_input_idx: Int,
    liquidator: VerificationKeyHash,
  }
  SettleLiquidation {
    collateral_input_idx: Int,
    position_input_idx: Int,
    pool_output_idx: Int,
  }
}

// Liquidation configuration
pub type LiquidationConfig {
  collateral_ratio: Int,          // Minimum collateral ratio (e.g., 150 for 150%)
  liquidation_penalty: Int,       // Liquidation penalty percentage (e.g., 5 for 5%)
  max_tx_validity: Int,          // Maximum transaction validity period
  lending_pool_address: Address,  // Address of the lending pool
  position_registry_address: Address, // Address of position registry
}

validator liquidation_example {
  spend(
    datum: Option<Data>,
    redeemer: LiquidationRedeemer,
    output_ref: OutputReference,
    this_tx: Transaction,
  ) {
    when redeemer is {
      InitiateLiquidation { 
        collateral_input_idx, 
        position_input_idx, 
        liquidator 
      } -> {
        // Get collateral input
        expect Some(collateral_input) = list.at(this_tx.inputs, collateral_input_idx)
        expect collateral_input.output_reference == output_ref
        
        // Get position input
        expect Some(position_input) = list.at(this_tx.inputs, position_input_idx)
        
        // Extract collateral datum
        expect InlineDatum(collateral_raw) = collateral_input.output.datum
        expect collateral_datum: CollateralDatum = collateral_raw
        
        // Extract position datum
        expect InlineDatum(position_raw) = position_input.output.datum
        expect position_datum: PositionRegistryDatum = position_raw
        
        // Check if position is eligible for liquidation
        let loan = position_datum.loan
        let eligible = is_eligible_for_liquidation(
          loan, 
          150, // 150% collateral ratio
          (100, 2), // Mock price: 1.00 with 2 decimals
        )
        
        // Validate liquidator signature
        let signed_by_liquidator = list.has(this_tx.extra_signatories, liquidator)
        
        and {
          eligible?,
          signed_by_liquidator?,
        }
      }
      
      SettleLiquidation { 
        collateral_input_idx, 
        position_input_idx, 
        pool_output_idx 
      } -> {
        // Get inputs
        expect Some(collateral_input) = list.at(this_tx.inputs, collateral_input_idx)
        expect collateral_input.output_reference == output_ref
        expect Some(position_input) = list.at(this_tx.inputs, position_input_idx)
        expect Some(pool_output) = list.at(this_tx.outputs, pool_output_idx)
        
        // Extract position datum to get loan details
        expect InlineDatum(position_raw) = position_input.output.datum
        expect position_datum: PositionRegistryDatum = position_raw
        let loan = position_datum.loan
        
        // Validate that lending pool receives borrowed amount + interest
        let expected_repayment = loan.borrowed_amt + loan.interest_amt
        let loanable_received = quantity_of(
          pool_output.value,
          loan.borrowed_asset.policy_id,
          loan.borrowed_asset.asset_name,
        )
        
        // Check repayment amount
        let repayment_valid = loanable_received >= expected_repayment
        
        // Verify liquidator signature (from position datum)
        expect Some(liquidator) = position_datum.liquidator
        let signed_by_liquidator = list.has(this_tx.extra_signatories, liquidator)
        
        and {
          repayment_valid?,
          signed_by_liquidator?,
        }
      }
    }
  }
  
  else(_ctx: ScriptContext) {
    fail @"Unsupported purpose for liquidation validator"
  }
}

// Helper function to check if a loan position is eligible for liquidation
pub fn is_eligible_for_liquidation(
  loan: LoanDatum,
  min_collateral_ratio: Int,
  current_price: QuotePrice,
) -> Bool {
  let (price, decimals) = current_price
  let collateral_value = loan.collateral_amt * price
  let required_collateral = loan.borrowed_amt * min_collateral_ratio
  
  // Check if undercollateralized (collateral value < required)
  let is_undercollateralized = collateral_value * 100 < required_collateral
  
  // For this example, we'll just check undercollateralization
  // In a real implementation, you would also check maturity
  is_undercollateralized
}

// Helper function to calculate liquidation penalty
pub fn calculate_liquidation_penalty(
  borrowed_amt: Int,
  penalty_rate: Int,
) -> Int {
  borrowed_amt * penalty_rate / 100
}

// Helper function to validate position token matching
pub fn validate_position_tokens_match(
  collateral_input: Input,
  position_input: Input,
  pool_policy: PolicyId,
) -> Bool {
  // Get position token from collateral
  let collateral_tokens = tokens(collateral_input.output.value, pool_policy)
  expect Some((pos_token_name, collateral_count)) = dict.to_list(collateral_tokens) |> list.head
  
  // Get position token from position registry
  let position_tokens = tokens(position_input.output.value, pool_policy)
  expect Some((pos_token_name_2, position_count)) = dict.to_list(position_tokens) |> list.head
  
  and {
    pos_token_name == pos_token_name_2,
    collateral_count == 1,
    position_count == 1,
  }
}

// Test 1: Successful liquidation initiation
test test_liquidation_initiation_success() {
  let collateral_datum = CollateralDatum {
    owner: Address {
      payment_credential: Script(#"abc123"),
      stake_credential: None,
    },
    collateral_asset: AssetClass {
      policy_id: #"", // ADA
      asset_name: #"",
    },
    status: LoanIssued,
  }
  
  let loan = LoanDatum {
    collateral_asset: AssetClass { policy_id: #"", asset_name: #"" },
    borrowed_asset: AssetClass { policy_id: #"def456", asset_name: #"USDM" },
    collateral_amt: 1000000000, // 1000 ADA
    borrowed_amt: 800000000,    // 800 USDM (undercollateralized if ADA drops)
    interest_amt: 40000000,     // 40 USDM interest
    loan_term: 2629746000,      // 30 days in milliseconds  
    maturity: 1640995200000,    // Future timestamp
  }
  
  let position_datum = PositionRegistryDatum {
    borrower: Address {
      payment_credential: Script(#"abc123"),
      stake_credential: None,
    },
    loan: loan,
    pos_id: #"pos001",
    liquidator: None,
  }
  
  let liquidator_key = #"liquidator123"
  
  let collateral_input = Input {
    output_reference: OutputReference { transaction_id: #"tx123", output_index: 0 },
    output: Output {
      address: Address {
        payment_credential: Script(#"collateral_contract"),
        stake_credential: None,
      },
      value: from_lovelace(1000000000),
      datum: InlineDatum(collateral_datum),
      reference_script: None,
    }
  }
  
  let position_input = Input {
    output_reference: OutputReference { transaction_id: #"tx124", output_index: 0 },
    output: Output {
      address: Address {
        payment_credential: Script(#"position_contract"),
        stake_credential: None,
      },
      value: from_lovelace(2000000),
      datum: InlineDatum(position_datum),
      reference_script: None,
    }
  }
  
  let tx = Transaction {
    inputs: [collateral_input, position_input],
    reference_inputs: [],
    outputs: [],
    fee: from_lovelace(200000),
    mint: from_asset(#"", #"", 0),
    certificates: [],
    withdrawals: dict.new(),
    validity_range: interval.everything(),
    extra_signatories: [liquidator_key],
    redeemers: dict.new(),
    datums: dict.new(),
    id: #"test_tx",
  }
  
  let redeemer = InitiateLiquidation {
    collateral_input_idx: 0,
    position_input_idx: 1,
    liquidator: liquidator_key,
  }
  
  liquidation_example.spend(
    Some(collateral_datum),
    redeemer,
    collateral_input.output_reference,
    tx,
  )
}

// Test 2: Failed liquidation - not eligible
test test_liquidation_not_eligible() fail {
  let collateral_datum = CollateralDatum {
    owner: Address {
      payment_credential: Script(#"abc123"),
      stake_credential: None,
    },
    collateral_asset: AssetClass {
      policy_id: #"", // ADA
      asset_name: #"",
    },
    status: LoanIssued,
  }
  
  let loan = LoanDatum {
    collateral_asset: AssetClass { policy_id: #"", asset_name: #"" },
    borrowed_asset: AssetClass { policy_id: #"def456", asset_name: #"USDM" },
    collateral_amt: 2000000000, // 2000 ADA (well collateralized)
    borrowed_amt: 800000000,    // 800 USDM
    interest_amt: 40000000,     // 40 USDM interest
    loan_term: 2629746000,      // 30 days in milliseconds
    maturity: 1640995200000,    // Future timestamp
  }
  
  let position_datum = PositionRegistryDatum {
    borrower: Address {
      payment_credential: Script(#"abc123"),
      stake_credential: None,
    },
    loan: loan,
    pos_id: #"pos001",
    liquidator: None,
  }
  
  let liquidator_key = #"liquidator123"
  
  let collateral_input = Input {
    output_reference: OutputReference { transaction_id: #"tx123", output_index: 0 },
    output: Output {
      address: Address {
        payment_credential: Script(#"collateral_contract"),
        stake_credential: None,
      },
      value: from_lovelace(2000000000),
      datum: InlineDatum(collateral_datum),
      reference_script: None,
    }
  }
  
  let position_input = Input {
    output_reference: OutputReference { transaction_id: #"tx124", output_index: 0 },
    output: Output {
      address: Address {
        payment_credential: Script(#"position_contract"),
        stake_credential: None,
      },
      value: from_lovelace(2000000),
      datum: InlineDatum(position_datum),
      reference_script: None,
    }
  }
  
  let tx = Transaction {
    inputs: [collateral_input, position_input],
    reference_inputs: [],
    outputs: [],
    fee: from_lovelace(200000),
    mint: from_asset(#"", #"", 0),
    certificates: [],
    withdrawals: dict.new(),
    validity_range: interval.everything(),
    extra_signatories: [liquidator_key],
    redeemers: dict.new(),
    datums: dict.new(),
    id: #"test_tx",
  }
  
  let redeemer = InitiateLiquidation {
    collateral_input_idx: 0,
    position_input_idx: 1,
    liquidator: liquidator_key,
  }
  
  // This should fail because the position is well-collateralized
  liquidation_example.spend(
    Some(collateral_datum),
    redeemer,
    collateral_input.output_reference,
    tx,
  )
}