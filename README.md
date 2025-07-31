# DeFi Lending Smart Contracts Library

**A comprehensive template library for building institutional-grade DeFi lending protocols on Cardano**

[![Aiken](https://img.shields.io/badge/Aiken-Smart%20Contracts-blue)](https://aiken-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Off--chain-blue)](https://www.typescriptlang.org/)
[![Deno](https://img.shields.io/badge/Deno-Runtime-green)](https://deno.land/)
[![Cardano](https://img.shields.io/badge/Cardano-Blockchain-blue)](https://cardano.org/)

---

## 🎯 **Overview**

This library provides a complete set of **smart contracts** and **off-chain infrastructure** for building production-ready DeFi lending protocols on Cardano. Designed as a comprehensive template system, it offers battle-tested primitives that can be customized and extended for various lending use cases.

### **Key Features**

✅ **6 Core Smart Contracts** - Complete lending protocol primitives  
✅ **40+ CLI Operations** - Full protocol management toolkit  
✅ **TypeScript Integration** - Type-safe off-chain infrastructure  
✅ **DEX Support** - Automated liquidation via Minswap  
✅ **Oracle System** - Price feeds with staleness protection  
✅ **Security-First Design** - Tested patterns and comprehensive validation  
✅ **Template Architecture** - Modular, extensible, and customizable  

---

## 🏗️ **Architecture**

### **Smart Contract Layer (Aiken)**
```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Collateral    │ │  Lending Pool   │ │ Position Registry│
│   Management    │ │ (Issuance &     │ │ (Ownership &    │
│                 │ │  Redemption)    │ │  Custody)       │
└─────────────────┘ └─────────────────┘ └─────────────────┘
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│     Oracle      │ │   Liquidation   │ │   Audit &       │
│   (Price Data)  │ │   Management    │ │   Reporting     │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### **Off-chain Infrastructure (TypeScript/Deno)**
```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   CLI Tools     │ │  TypeScript     │ │  Integration    │
│  (40+ Commands) │ │   Libraries     │ │   Modules       │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## 📚 **Documentation**

| Document | Description |
|----------|-------------|
| **[📖 Smart Contracts Documentation](docs/SMART_CONTRACTS_DOCUMENTATION.md)** | Detailed technical documentation of all 6 smart contracts |
| **[🔧 Library Usage Guide](docs/LIBRARY_USAGE_GUIDE.md)** | Complete guide for using and customizing the library |
| **[⚙️ Off-chain Components](docs/OFF-CHAIN_COMPONENTS.md)** | Comprehensive off-chain infrastructure documentation |
| **[⚙️ Live Demonstration](docs/RUN_DEMO.md)** | Detailed demonstration of all smart contracts, incl. on-chain transactions |
---

## 🔧 **The Six Core Contracts**

### **Why These Six Contracts?**

These contracts were specifically selected based on community feedback and ecosystem analysis. They represent the **minimal set of primitives** needed to build institutional-grade DeFi protocols while avoiding duplication of efforts. Each contract addresses a fundamental challenge in DeFi:

### **1. 🔒 Collateral Management Contract**
**Securing Value in DeFi**

- **Collateral Locking**: Securely holds user assets (ADA) until loan conditions are met
- **Ownership Tracking**: Maintains immutable records through datums
- **State Management**: Multi-state machine (unlocked → loan requested → processed → repayment)
- **Conditional Release**: Releases collateral only upon valid conditions

*Essential for any collateralized lending protocol, stablecoin system, or derivatives platform*

### **2. 🏦 Lending Pool Contract (Issuance & Redemption Logic)**
**Creating Financial Instruments**

- **Token Issuance**: Issues borrowed assets (stablecoins like USDM) against validated collateral
- **Redemption Processing**: Accepts repayments with interest calculations
- **Parameter Management**: Maintains collateralization ratios and interest rates
- **Token Accounting**: Tracks circulating supply and available liquidity

*Demonstrates principles for stablecoin issuance, synthetic assets, and tokenized real-world assets*

### **3. 📊 Price Oracle Contract**
**Determining Fair Value**

- **Price Feed Integration**: Validates price data from trusted sources (Minswap DEX)
- **Multi-Asset Support**: Handles multiple asset price feeds simultaneously
- **Freshness Checks**: Ensures timely updates with staleness protection
- **Access Control**: Restricts updates to authorized oracle providers

*Essential for accurate asset valuations in lending, derivatives, and synthetic asset protocols*

### **4. 📋 Position Registry Contract (Ownership & Custody Logic)**
**Transferring Ownership**

- **Asset Registration**: Records and validates on-chain asset ownership
- **Transfer Authorization**: Enables ownership transfers with proper authorization
- **Audit Trail**: Maintains immutable history of ownership changes
- **Delegation Support**: Enables custody without losing ownership

*Critical for tokenized assets, NFT custody, institutional DeFi, DAOs, and investment funds*

### **5. ⚡ Liquidation Contract**
**Maintaining Solvency**

- **Health Factor Monitoring**: Tracks collateralization ratios in real-time
- **Automatic Triggers**: Identifies under-collateralized positions via oracle prices
- **Incentive Distribution**: Manages liquidator rewards to ensure system stability
- **DEX Integration**: Automated liquidation via multiple DEX protocols

*Essential for protocol solvency in lending markets and synthetic asset systems*

### **6. 📈 Audit & Reporting Contract**
**Ensuring Protocol Transparency**

- **Real-Time Metrics**: Calculates protocol health indicators (TVL, utilization rates)
- **Proof of Reserves**: Generates cryptographic proofs of asset backing
- **Event Logging**: Records all significant protocol actions
- **Compliance Reporting**: Provides structured data for regulatory needs

*Builds trust through transparency, essential for institutional adoption and risk assessment*

---

## 🚀 **Quick Start**

### **Prerequisites**
- **[Aiken](https://aiken-lang.org/)** - Latest version for compiling smart contracts
- **[Deno](https://deno.land/)** v2.3.5+ for running off-chain scripts
- **Cardano Node Access** - Kupo, Ogmios, or Blockfrost API

### **Installation**

```bash
# Clone the repository
git clone <repository-url> my-lending-protocol
cd my-lending-protocol

# Install dependencies
deno install --allow-scripts=npm:cbor-extract

# Compile smart contracts
cd onchain
aiken build
cd ..

# Configure environment
cp .env_sample .env
# Edit .env with your configuration
```

### **Deploy Protocol**

```bash
# Deploy reference scripts and initialize protocol
deno task deploy-refscripts

# Get test tokens (testnet only)
deno task get-loanable-tokens

# Initialize lending pool
deno task deposit-loanable-asset

# Start oracle price updates
deno task update-oracle-price
```

---

## 💼 **Usage Examples**

### **Basic Lending Flow**

```bash
# User deposits collateral
deno task deposit-collateral-user1

# User requests loan
deno task borrow-user1

# User repays loan
deno task repay-user1

# User withdraws collateral
deno task withdraw-collateral-user1
```

### **Protocol Management**

```bash
# Monitor protocol health
deno task audit

# List all loan positions
deno task list-loan-positions

# Liquidate undercollateralized positions
deno task liquidate-position
```

### **Development & Testing**

```bash
# Run with dry-run mode (simulation)
deno task borrow-user1-dryrun
deno task liquidate-position-dryrun

# Run smart contract tests
cd onchain
aiken check
```

---

## 🔧 **Customization**

### **Asset Configuration**

```typescript
// lib/common.ts
export const myCollateralAsset: AssetClass = {
    policy_id: "your_policy_id",
    asset_name: "your_asset_name",
};
```

### **Interest Rate Configuration**

```typescript
// lib/lending-pool.ts
export const customIntRates = {
    "7 days": { term: 604_800_000n, rate: 8n },
    "30 days": { term: 2_592_000_000n, rate: 15n },
    "90 days": { term: 7_776_000_000n, rate: 25n },
};
```

### **Protocol Parameters**

```typescript
const protocolConfig = {
    collateral_ratio: 150, // 150% minimum collateralization
    max_tx_validity: 3600000, // 1 hour max transaction validity
    liquidation_penalty: 5, // 5% liquidation penalty
};
```

---

## 🏛️ **Use Cases**

### **1. Basic Lending Protocol**
- Single collateral asset (ADA)
- Single loanable asset (stablecoin)
- Fixed interest rates
- Manual liquidations

### **2. Multi-Asset Lending Platform**
- Multiple collateral assets
- Multiple loanable assets  
- Dynamic interest rates
- Automated liquidations

### **3. Institutional Lending**
- High minimum amounts
- Extended loan terms
- Multi-signature requirements
- Advanced reporting

### **4. Cross-Chain Lending**
- Wrapped assets as collateral
- Bridge integration
- Cross-chain liquidations

### **5. Algorithmic Interest Rates**
- Dynamic rate calculation
- Utilization-based rates
- Market-responsive adjustments

---

## 🛡️ **Security Features**

### **Smart Contract Security**
- ✅ **Input Validation** - All redeemer parameters validated
- ✅ **Signature Requirements** - Multi-signature support for critical operations
- ✅ **Oracle Security** - Easy integration of new oracle sources
- ✅ **Access Control** - Role-based permissions (Admin, Oracle, User)

### **Off-chain Security**
- ✅ **Key Management** - Environment-based seed phrase management
- ✅ **Transaction Validation** - Pre-transaction validation of all components
- ✅ **Replay Protection** - Built-in transaction replay protection
- ✅ **Audit Logging** - Comprehensive logging and monitoring

### **Battle-tested Patterns**
- ✅ **Two-Phase Transactions** - Prevents concurrency issues
- ✅ **Beacon Token System** - Unique UTXO identification
- ✅ **Input Indexing** - Reduces double-satisfaction risks
- ✅ **Reference Scripts** - Minimizes transaction sizes

---

## 📊 **Available CLI Commands**

<details>
<summary><strong>🔧 Protocol Setup (7 commands)</strong></summary>

```bash
deno task deploy-refscripts           # Deploy all reference scripts
deno task mint-beacon-tokens          # Mint protocol beacon tokens
deno task deposit-loanable-asset      # Initialize lending pool
deno task get-loanable-tokens         # Get test tokens (testnet)
deno task update-oracle-price         # Start oracle service
deno task burn-beacon-tokens          # Burn beacon tokens (cleanup)
deno task undeploy-refscripts         # Undeploy reference scripts
```
</details>

<details>
<summary><strong>👤 User Operations (12 commands)</strong></summary>

```bash
# Collateral Operations
deno task deposit-collateral-user1    # Deposit collateral
deno task deposit-collateral-user2    # Deposit collateral (user 2)
deno task withdraw-collateral-user1   # Withdraw collateral
deno task withdraw-collateral-user2   # Withdraw collateral (user 2)

# Loan Operations  
deno task borrow-user1               # Take loan (two-phase)
deno task borrow-user2               # Take loan (user 2)
deno task repay-user1                # Repay loan (two-phase)
deno task repay-user2                # Repay loan (user 2)

# Emergency Operations
deno task reset-borrow-req-user1     # Reset loan request
deno task reset-borrow-req-user2     # Reset loan request (user 2)
deno task reset-repay-req-user1      # Reset repay request
deno task reset-repay-req-user2      # Reset repay request (user 2)
```
</details>

<details>
<summary><strong>⚡ Liquidation System (6 commands)</strong></summary>

```bash
deno task liquidate-position         # Auto-liquidate positions
deno task liquidation-cancel         # Cancel liquidation order
deno task liquidation-settle         # Settle liquidation
deno task withdraw-collateral-swapped # Withdraw liquidated collateral
```
</details>

<details>
<summary><strong>📊 Monitoring & Admin (8 commands)</strong></summary>

```bash
deno task list-loan-positions        # List all positions
deno task audit                      # Update protocol health
deno task audit-view                 # View audit data
deno task withdraw-loanable-asset    # Withdraw from pool (admin)
deno task retrieve-deploy-details    # Get deployment info
deno task get-built-sizes           # Check contract sizes
```
</details>

<details>
<summary><strong>🧪 Testing & Development (All commands with -dryrun suffix)</strong></summary>

Every command above has a corresponding `-dryrun` version for safe testing:
```bash
deno task borrow-user1-dryrun        # Simulate loan without execution
deno task liquidate-position-dryrun  # Test liquidation logic
# ... and 20+ more dry-run commands
```
</details>

---

## 🌟 **Advanced Features**

### **DEX Integration**
- **Minswap**: Primary integration for liquidations and price feeds
- **Extensible**: Easy to add new DEX protocols

### **Oracle System**
- **Multi-Provider**: Support for multiple price feed providers
- **Staleness Protection**: Automatic price data validation
- **Update Automation**: Continuous price feed updates
- **Custom Providers**: Easy integration of new oracle sources

### **Liquidation Engine**
- **Health monitoring**: Real-time collateralization tracking
- **Automated Triggers**: Automatic liquidation detection
- **Incentive System**: Liquidator rewards and penalties

---

## 🤝 **Contributing**

We welcome contributions to improve the library! Please:

1. **Fork** the repository
2. **Create** a feature branch
3. **Add tests** for new functionality  
4. **Submit** a pull request with detailed description

### **Development Setup**

```bash
# Clone for development
git clone <your-fork-url>
cd DeFi-Lending-Smart-Contracts

# Run tests
cd onchain
aiken check

# Test CLI operations
deno task list-loan-positions-dryrun
```

---

## 📋 **Requirements**

### **Development**
- **Aiken**: Latest version
- **Deno**: v2.3.5+
- **Git**: For version control

### **Deployment**
- **Cardano Node**: Testnet/Mainnet access
- **Provider APIs**: Kupo, Ogmios, or Blockfrost
- **Wallet**: Funded wallet for transaction fees

---

## 📄 **License**

This project is licensed under the **APACHE License 2.0** - see the [LICENSE](LICENSE) file for details.

---
## 🆘 **Support**

### **Documentation**
- 📖 **[Smart Contracts](docs/SMART_CONTRACTS_DOCUMENTATION.md)** - Technical contract documentation
- 🔧 **[Usage Guide](docs/LIBRARY_USAGE_GUIDE.md)** - Complete usage and customization guide  
- ⚙️ **[Off-chain Components](docs/OFF-CHAIN_COMPONENTS.md)** - Infrastructure documentation

### **Community**
- **GitHub Issues**: Bug reports and feature requests
- **Discussions**: Community support and questions

### **Getting Help**
- Check the documentation first
- Search existing GitHub issues
- Create a new issue with detailed information

---

<div align="center">

**Built with ❤️ for the Cardano DeFi Ecosystem**

</div>