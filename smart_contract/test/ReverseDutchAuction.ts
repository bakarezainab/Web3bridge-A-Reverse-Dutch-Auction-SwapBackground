import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@hardhat/hardhat-ethers/signers";
import { Contract } from "ethers";

describe("ReverseDutchAuctionSwap", function () {
    let contract: Contract;
    let token: Contract;
    let owner: SignerWithAddress;
    let seller: SignerWithAddress;
    let buyer: SignerWithAddress;
    let buyer2: SignerWithAddress;

    beforeEach(async function () {
        [owner, seller, buyer, buyer2] = await ethers.getSigners();

        // Deploy mock ERC20 token
        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("Test Token", "TEST", ethers.utils.parseEther("1000000"));
        await token.deployed();

        // Deploy auction contract
        const ReverseDutchAuction = await ethers.getContractFactory("ReverseDutchAuctionSwap");
        contract = await ReverseDutchAuction.deploy();
        await contract.deployed();
    });

    it("should decrease price correctly over time", async function () {
        const initialPrice = ethers.utils.parseEther("1");
        const duration = 100;
        const decayRate = ethers.utils.parseEther("0.01");
        const amount = 1000;

        await token.transfer(seller.address, amount);
        await token.connect(seller).approve(contract.address, amount);
        
        await contract.connect(seller).createAuction(
            token.address,
            initialPrice,
            duration,
            decayRate,
            amount
        );

        const startPrice = await contract.getCurrentPrice(0);
        expect(startPrice).to.equal(initialPrice);

        // Advance time by 50 seconds
        await ethers.provider.send("evm_increaseTime", [50]);
        await ethers.provider.send("evm_mine", []);

        const midPrice = await contract.getCurrentPrice(0);
        expect(midPrice).to.be.lt(startPrice);
        expect(midPrice).to.equal(initialPrice.sub(decayRate.mul(50)));

        // Advance time to end
        await ethers.provider.send("evm_increaseTime", [50]);
        await ethers.provider.send("evm_mine", []);

        const endPrice = await contract.getCurrentPrice(0);
        expect(endPrice).to.equal(0);
    });

    it("should allow only one buyer per auction", async function () {
        const initialPrice = ethers.utils.parseEther("1");
        const duration = 100;
        const decayRate = ethers.utils.parseEther("0.01");
        const amount = 1000;

        await token.transfer(seller.address, amount);
        await token.connect(seller).approve(contract.address, amount);
        
        await contract.connect(seller).createAuction(
            token.address,
            initialPrice,
            duration,
            decayRate,
            amount
        );

        // First buyer succeeds
        await contract.connect(buyer).buy(0, { value: initialPrice });

        // Second buyer should fail
        await expect(
            contract.connect(buyer2).buy(0, { value: initialPrice })
        ).to.be.revertedWith("Auction not active");
    });

    it("should correctly swap funds and tokens", async function () {
        const initialPrice = ethers.utils.parseEther("1");
        const duration = 100;
        const decayRate = ethers.utils.parseEther("0.01");
        const amount = 1000;

        await token.transfer(seller.address, amount);
        await token.connect(seller).approve(contract.address, amount);
        
        const sellerInitialBalance = await ethers.provider.getBalance(seller.address);
        const buyerInitialTokenBalance = await token.balanceOf(buyer.address);

        await contract.connect(seller).createAuction(
            token.address,
            initialPrice,
            duration,
            decayRate,
            amount
        );

        await contract.connect(buyer).buy(0, { value: initialPrice });

        // Check token transfer
        expect(await token.balanceOf(buyer.address)).to.equal(buyerInitialTokenBalance.add(amount));
        
        // Check ETH transfer (approximately due to gas costs)
        const sellerFinalBalance = await ethers.provider.getBalance(seller.address);
        expect(sellerFinalBalance).to.be.gt(sellerInitialBalance);
    });

    it("should handle auction expiration without buyers", async function () {
        const initialPrice = ethers.utils.parseEther("1");
        const duration = 100;
        const decayRate = ethers.utils.parseEther("0.01");
        const amount = 1000;

        await token.transfer(seller.address, amount);
        await token.connect(seller).approve(contract.address, amount);
        
        await contract.connect(seller).createAuction(
            token.address,
            initialPrice,
            duration,
            decayRate,
            amount
        );

        // Advance time past duration
        await ethers.provider.send("evm_increaseTime", [duration + 1]);
        await ethers.provider.send("evm_mine", []);

        // Price should be 0
        expect(await contract.getCurrentPrice(0)).to.equal(0);

        // Buying should fail
        await expect(
            contract.connect(buyer).buy(0, { value: initialPrice })
        ).to.be.revertedWith("Auction expired");

        // Seller should be able to cancel
        await contract.connect(seller).cancelAuction(0);
        expect(await token.balanceOf(seller.address)).to.equal(amount);
    });
});