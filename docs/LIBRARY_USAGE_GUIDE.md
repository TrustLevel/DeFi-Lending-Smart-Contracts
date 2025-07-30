# DeFi Lending Smart Contracts - Library Usage Guide

## Overview

This library provides a complete set of smart contracts and off-chain infrastructure for building institutional-grade DeFi lending protocols on Cardano. The library is designed as a template system that can be customized and extended for various lending use cases.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Architecture Overview](#architecture-overview)
3. [Customizing the Protocol](#customizing-the-protocol)
4. [Deployment Guide](#deployment-guide)
5. [Integration Patterns](#integration-patterns)
6. [Security Considerations](#security-considerations)
7. [Testing & Validation](#testing--validation)
8. [Common Use Cases](#common-use-cases)

---

## Getting Started

### Prerequisites

- **Aiken**: Latest version for compiling smart contracts
- **Deno**: v2.3.5+ for running off-chain scripts
- **Cardano Node**: Access to Cardano testnet/mainnet
- **Oracle Providers**: Kupo, Ogmios, or Blockfrost API access

### Quick Setup

1. **Clone and Install**
   ```bash
   git clone <repository-url> my-lending-protocol
   cd my-lending-protocol
   deno install --allow-scripts=npm:cbor-extract
   ```

2. **Compile Smart Contracts**
   ```bash
   cd onchain
   aiken build
   ```

3. **Configure Environment**
   ```bash
   cp .env_sample .env
   # Edit .env with your configuration
   ```

4. **Deploy Protocol**
   ```bash
   deno task deploy-refscripts
   ```

---

## Architecture Overview

### Core Components

The library consists of three main layers:

#### **1. Smart Contract Layer (Aiken)**
- **6 Core Validators**: Settings, Collateral, Lending Pool, Position Registry, Oracle, Audit
- **1 Example Validator**: Liquidation template for custom implementations
- **Helper Libraries**: Shared utilities and type definitions

#### **2. Off-chain Infrastructure (TypeScript/Deno)**
- **Transaction Builders**: Pre-built transaction construction
- **CLI Tools**: 40+ command-line operations
- **Integration Modules**: DEX, Oracle, and external service connectors

#### **3. Configuration System**
- **Environment-based**: Testnet/Mainnet switching
- **Role-based Access**: Admin, Oracle Provider, User configurations
- **Asset Definitions**: Customizable collateral and loanable assets

### Data Flow

```
User Request → Off-chain Validation → Smart Contract Execution → State Update
     ↓              ↓                        ↓                    ↓
CLI Tools    →  TypeScript Lib  →    Aiken Validators   →   UTXO Updates
```

---

## Customizing the Protocol

### Asset Configuration

#### **1. Define Your Assets**

Edit `lib/common.ts`:

```typescript
// Your custom collateral asset
export const myCollateralAsset: AssetClass = {
    policy_id: "your_policy_id",
    asset_name: "your_asset_name",
};

// Your custom loanable asset
export const myLoanableAsset: AssetClass = {
    policy_id: "your_policy_id", 
    asset_name: "your_asset_name",
};
```

#### **2. Update Interest Rates**

Modify `lib/lending-pool.ts`:

```typescript
export const customIntRates = {
    "7 days": { term: 604_800_000n, rate: 8n },
    "30 days": { term: 2_592_000_000n, rate: 15n },
    "90 days": { term: 7_776_000_000n, rate: 25n },
};
```

### Protocol Parameters

#### **1. Collateral Ratios**

Update global settings in deployment scripts:

```typescript
const protocolConfig = {
    collateral_ratio: 150, // 150% minimum collateralization
    max_tx_validity: 3600000, // 1 hour max transaction validity
    liquidation_penalty: 5, // 5% liquidation penalty
};
```

#### **2. Oracle Configuration**

Configure trusted price providers:

```typescript
const oracleProviders = [
    "provider1_key_hash",
    "provider2_key_hash", 
    "provider3_key_hash",
];
```

### Smart Contract Customization

#### **1. Extend Existing Validators**

Create custom validators by extending base functionality:

```aiken
// custom_collateral.ak
use validators/collateral.{collateral}
use types.{CustomRedeemer}

validator custom_collateral(settings_script: ScriptHash) {
  spend(datum, redeemer, output_ref, tx) {
    when redeemer is {
      CustomRedeemer { .. } -> {
        // Your custom logic here
        custom_validation_logic(datum, tx)
      }
      _ -> collateral.spend(settings_script, datum, redeemer, output_ref, tx)
    }
  }
}
```

#### **2. Add New Validators**

Follow the liquidation validator example in `validators/liquidation.ak` to create specialized validators for your use case.

---

## Deployment Guide

### Local Testnet Deployment

1. **Prepare Environment**
   ```bash
   # Set up testnet configuration
   export PROVIDER_NETWORK="Preprod"
   export KUPO_PREPROD="your_kupo_endpoint"
   export OGMIOS_PREPROD="your_ogmios_endpoint"
   ```

2. **Deploy Reference Scripts**
   ```bash
   deno task deploy-refscripts
   ```

3. **Initialize Protocol**
   ```bash
   # Get test tokens
   deno task get-loanable-tokens
   
   # Deposit into lending pool  
   deno task deposit-loanable-asset
   
   # Start oracle service
   deno task update-oracle-price
   ```

### Mainnet Deployment

1. **Security Checklist**
   - [ ] All custom validators tested thoroughly
   - [ ] Oracle providers verified and trusted
   - [ ] Multi-signature setup for admin operations
   - [ ] Emergency procedures documented

2. **Gradual Rollout**
   ```bash
   # Deploy with limited funds first
   deno task deploy-refscripts
   
   # Test with small amounts
   deno task deposit-loanable-asset
   
   # Monitor for 24-48 hours before scaling
   ```

---

## Integration Patterns

### DEX Integration

#### **Adding New DEX Support**

1. **Extend DEX Types**
   ```typescript
   export enum DexType {
       Minswap = "Minswap",
       SundaeSwap = "SundaeSwap", 
       WingRiders = "WingRiders",
       YourDex = "YourDex", // Add your DEX
   }
   ```

2. **Implement DEX Interface**
   ```typescript
   export const yourDexAdapter = {
       createSwapOrder: (params: SwapParams) => Transaction,
       validateSwapResult: (utxo: UTxO) => boolean,
       calculateSlippage: (amount: bigint, slippage: number) => bigint,
   };
   ```

### Oracle Integration

#### **Custom Price Feeds**

1. **Implement Price Provider**
   ```typescript
   export class CustomPriceProvider {
       async getPrice(asset: AssetClass): Promise<QuotePrice> {
           // Your price feed logic
           return [price, decimals];
       }
   }
   ```

2. **Register Provider**
   ```bash
   # Add provider to oracle settings
   deno task update-oracle-settings
   ```

### External System Integration

#### **Notification Systems**

```typescript
// Example: Discord/Slack notifications
export const notificationService = {
    onLiquidation: (position: PositionData) => {
        // Send alert
    },
    onLowCollateral: (positions: PositionData[]) => {
        // Send warnings  
    },
};
```

#### **Analytics Integration**

```typescript
// Example: Analytics data export
export const analyticsExporter = {
    exportDailyMetrics: () => {
        // Export protocol metrics
    },
    generateHealthReport: () => {
        // Generate health report
    },
};
```

---

## Security Considerations

### Smart Contract Security

#### **1. Input Validation**
- Always validate all redeemer parameters
- Check UTXO existence before accessing
- Verify asset quantities and types

#### **2. Signature Requirements**
- Implement multi-signature for critical operations
- Validate all required signatories are present
- Use time-locked operations for major changes

#### **3. Oracle Security**
- Use multiple trusted providers
- Implement price staleness checks
- Add circuit breakers for extreme price movements

### Off-chain Security

#### **1. Key Management**
- Use hardware wallets for production keys
- Implement key rotation procedures
- Separate admin, oracle, and operational keys

#### **2. Environment Security**
- Secure environment variable storage
- Use encrypted configuration files
- Implement access logging and monitoring

#### **3. Transaction Security**
- Always use dry-run mode for testing
- Implement transaction replay protection
- Validate all transaction components before signing

---

## Testing & Validation

### Smart Contract Testing

#### **1. Unit Tests**
```bash
cd onchain
aiken check  # Run all tests
aiken check -m liquidation  # Run specific validator tests
```

#### **2. Integration Tests**
```bash
# Test full protocol flow
deno task deposit-collateral-user1-dryrun
deno task borrow-user1-dryrun
deno task repay-user1-dryrun
```

#### **3. Property-Based Testing**

Create custom property tests:

```aiken
test property_collateral_conservation() {
    // Property: Total collateral value should never decrease unexpectedly
    forall {
        initial_collateral: Int,
        final_collateral: Int,
        operations: List<LendingOperation>,
    } {
        // Test property holds across all valid operations
    }
}
```

### Off-chain Testing

#### **1. CLI Testing**
```bash
# Test all operations in dry-run mode
for task in $(deno task | grep -E ".*-dryrun"); do
    deno task $task
done
```

#### **2. Load Testing**
```typescript
// Example: Simulate concurrent users
const simulateLoad = async (userCount: number) => {
    const promises = Array.from({length: userCount}, (_, i) => 
        simulateUserFlow(i)
    );
    await Promise.all(promises);
};
```

---

## Common Use Cases

### 1. Basic Lending Protocol

**Configuration:**
- Single collateral asset (e.g., ADA)
- Single loanable asset (e.g., stablecoin)
- Fixed interest rates
- Manual liquidations

**Implementation:**
Use the default configuration with minimal customization.

### 2. Multi-Asset Lending Platform

**Configuration:**
- Multiple collateral assets
- Multiple loanable assets
- Dynamic interest rates
- Automated liquidations

**Implementation:**
1. Extend asset definitions
2. Implement multi-asset oracle feeds
3. Customize lending pool logic for asset selection

### 3. Institutional Lending

**Configuration:**
- High minimum amounts
- Extended loan terms
- Multi-signature requirements
- Advanced reporting

**Implementation:**
1. Add minimum amount validations
2. Extend loan term options
3. Implement institutional KYC integration

### 4. Cross-Chain Lending

**Configuration:**
- Wrapped assets as collateral
- Bridge integration
- Cross-chain liquidations

**Implementation:**
1. Integrate with bridge protocols
2. Add cross-chain asset validators
3. Implement cross-chain oracle feeds

### 5. Algorithmic Interest Rates

**Configuration:**
- Dynamic rate calculation
- Utilization-based rates
- Market-responsive adjustments

**Implementation:**
1. Add utilization tracking
2. Implement rate calculation algorithms
3. Create automated rate adjustment mechanisms

---

## Advanced Features

### Custom Liquidation Strategies

```aiken
// Example: Gradual liquidation
validator gradual_liquidation {
    spend(datum, redeemer, output_ref, tx) {
        when redeemer is {
            GradualLiquidate { percentage } -> {
                // Liquidate only a percentage of collateral
                validate_partial_liquidation(datum, percentage, tx)
            }
        }
    }
}
```

### Flash Loan Integration

```aiken
// Example: Flash loan validator
validator flash_loans {
    spend(datum, redeemer, output_ref, tx) {
        when redeemer is {
            FlashLoan { amount, callback } -> {
                // Validate flash loan repayment in same transaction
                validate_flash_loan_repayment(amount, callback, tx)
            }
        }
    }
}
```

### Governance Integration

```typescript
// Example: Governance proposals
export const governanceModule = {
    proposeParameterChange: (param: string, value: any) => {
        // Create governance proposal
    },
    executeProposal: (proposalId: string) => {
        // Execute approved proposal
    },
};
```

---

## Troubleshooting

### Common Issues

#### **1. Transaction Failures**
```bash
# Check transaction details
deno task retrieve-deploy-details

# Verify UTXO availability
deno task list-loan-positions
```

#### **2. Oracle Data Issues**
```bash
# Check oracle status
deno task audit-view

# Update price data
deno task update-oracle-price
```

#### **3. Compilation Errors**
```bash
# Clean build
cd onchain
rm -rf artifacts/
aiken build
```

### Debug Mode

Enable detailed logging:
```bash
export DEBUG=true
export LOG_LEVEL=verbose
```

### Performance Optimization

1. **Transaction Size**: Use reference scripts to minimize sizes
2. **UTXO Management**: Regularly consolidate small UTXOs
3. **Oracle Updates**: Batch multiple asset price updates

---