import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, ContractFactory } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ReverseDutchAuctionSwap } from "../typechain-types/contracts/ReverseDutchAuctionSwap";
import { MockERC20 } from "../typechain-types/MockERC20";

describe("ReverseDutchAuctionSwap", function() {
  let reverseDutchAuction: ReverseDutchAuctionSwap;
  let mockToken: MockERC20;
  let owner: HardhatEthersSigner;
  let seller: HardhatEthersSigner;
  let buyer: HardhatEthersSigner;

  beforeEach(async function() {
    [owner, seller, buyer] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockToken = await ethers.getContractFactory("MockERC20");
    mockToken = await MockToken.deploy("Mock Token", "MTK") as MockERC20;
    await mockToken.waitForDeployment();

    // Deploy ReverseDutchAuctionSwap contract
    const ReverseDutchAuctionSwap = await ethers.getContractFactory("ReverseDutchAuctionSwap");
    reverseDutchAuction = await ReverseDutchAuctionSwap.deploy() as ReverseDutchAuctionSwap;
    await reverseDutchAuction.waitForDeployment();

    // Mint tokens to seller
    await mockToken.mint(seller.address, ethers.parseEther("1000"));
    await mockToken.connect(seller).approve(await reverseDutchAuction.getAddress(), ethers.parseEther("1000"));
  });

  describe("createAuction", function() {
    it("should create an auction successfully", async function() {
      const initialPrice = ethers.parseEther("1");
      const duration = 3600n; // 1 hour
      const decayRate = ethers.parseEther("0.0001");
      const amount = ethers.parseEther("100");

      await expect(reverseDutchAuction.connect(seller).createAuction(
        await mockToken.getAddress(),
        initialPrice,
        duration,
        decayRate,
        amount
      )).to.emit(reverseDutchAuction, "AuctionCreated");

      const auction = await reverseDutchAuction.auctions(0);
      expect(auction.seller).to.equal(seller.address);
      expect(auction.amount).to.equal(amount);
      expect(auction.active).to.be.true;
    });
  });

  describe("getCurrentPrice", function() {
    it("should return correct price after time passage", async function() {
      const initialPrice = ethers.parseEther("1");
      const duration = 3600n;
      const decayRate = ethers.parseEther("0.0001");
      const amount = ethers.parseEther("100");

      await reverseDutchAuction.connect(seller).createAuction(
        await mockToken.getAddress(),
        initialPrice,
        duration,
        decayRate,
        amount
      );

      // Simulate time passage (30 minutes)
      await ethers.provider.send("evm_increaseTime", [1800]);
      await ethers.provider.send("evm_mine", []);

      const currentPrice = await reverseDutchAuction.getCurrentPrice(0);
      expect(currentPrice).to.be.lt(initialPrice);
    });
  });

  describe("buy", function() {
    it("should allow buying tokens at current price", async function() {
      const initialPrice = ethers.parseEther("1");
      const duration = 3600n;
      const decayRate = ethers.parseEther("0.0001");
      const amount = ethers.parseEther("100");

      await reverseDutchAuction.connect(seller).createAuction(
        await mockToken.getAddress(),
        initialPrice,
        duration,
        decayRate,
        amount
      );

      const currentPrice = await reverseDutchAuction.getCurrentPrice(0);
      
      await expect(reverseDutchAuction.connect(buyer).buy(0, { value: currentPrice }))
        .to.emit(reverseDutchAuction, "AuctionFinalized");

      const buyerBalance = await mockToken.balanceOf(buyer.address);
      expect(buyerBalance).to.equal(amount);
    });
  });

  describe("cancelAuction", function() {
    it("should allow seller to cancel auction", async function() {
      const initialPrice = ethers.parseEther("1");
      const duration = 3600n;
      const decayRate = ethers.parseEther("0.0001");
      const amount = ethers.parseEther("100");

      await reverseDutchAuction.connect(seller).createAuction(
        await mockToken.getAddress(),
        initialPrice,
        duration,
        decayRate,
        amount
      );

      await expect(reverseDutchAuction.connect(seller).cancelAuction(0))
        .to.emit(reverseDutchAuction, "AuctionCancelled");

      const auction = await reverseDutchAuction.auctions(0);
      expect(auction.active).to.be.false;
    });
  });
});