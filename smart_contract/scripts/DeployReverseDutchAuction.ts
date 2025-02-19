import { ethers } from "hardhat";

async function main() {
  const ReverseDutchAuctionSwap = await ethers.deployContract("ReverseDutchAuctionSwap");
  await ReverseDutchAuctionSwap.waitForDeployment();

  console.log(
    `Contract successfully deployed to: ${ReverseDutchAuctionSwap.target}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});