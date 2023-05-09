const { assert, expect  } = require("chai")
const { network, ethers, getNamedAccounts } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name) 
    ? describe.skip 
    : describe("Lottery Unit Tests", function () {
        let lottery,lotteryEntranceFee, deployer

        beforeEach(async () => {
            deployer = (await getNamedAccounts()).deployer
            lottery = await lottery.getContract("Lottery", deployer)
            lotteryEntranceFee = await lottery.getEntranceFee()
        })

        describe('fulfillRandomWords', () => {
            it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async () => {
                console.log("Setting up test..")
                const startingTimeStamp = await lottery.getLastTimeStamp();
                const accounts = await ethers.getSigners()

                console.log("Setting up listeners...")

                await new Promise(async (resolve , reject ) => {
                    lottery.once("Winner Picked", async () => {
                        console.log("Winner Picked Event fired")


                        try {
                          const recentWinner = await lottery.getRecentWinner()
                          const lotteryState = await lottery.getLotteryState()
                          const winnerEndingBalance = await accounts[0].getBalance()
                          const endingTimeStamp = await lottery.getLastTimeStamp
                          await expect(lottery.getPayer(0)).to.be.reverted
                          assert.equal(recentWinner.toString(), accounts[2].address)
                              assert.equal(lotteryState, 0)
                              assert.equal(
                                winnerEndingBalance.toString(),
                                winnerStartingBalance.add(lotteryEntranceFee).toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)  
                              resolve()
                        } catch (error) {
                            reject(error)
                        }
                    })

                    const tx = await lottery.enterRaffle({ value: lotteryEntranceFee })
                    await tx.wait(1)
                    console.log("Ok, time to wait...")
                    const winnerStartingBalance = await accounts[0].getBalance()
                    
                })
            })
        })


    })