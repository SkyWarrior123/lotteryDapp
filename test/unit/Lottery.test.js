const { assert, expect  } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name) 
    ? describe.skip 
    : describe("Lottery Unit Tests", function () {
        let lottery, lotteryContract, vrfCoordinatorV2Mock, lotteryEntranceFee, interval,  player

        beforeEach(async () => {
            const accounts = await ethers.getSigners()

            player = accounts[0]
            await deployments.fixture("mocks", "lottery")
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
            lotteryContract = await ethers.getContract("Lottery");
            lottery = lotteryContract.connect(player);
            lotteryEntranceFee = await lottery.getEntranceFee();
            interval = await lottery.getInterval();
        })

        describe('enterLottery', () => { 
            it("initializes the lottery correctly", async function () {

                const lotteryState = (await lottery.getLotteryState()).toString();

                assert.equal(lotteryState, "0");
                assert.equal(
                    interval.toString(),
                    networkConfig[network.config.chainId]["keepersUpdateInterval"]
                );
            })
        })

        describe('enterLottery', () => {
            it("should revert when you don't pay enough", async () => {
                await expect(lottery.enterLottery()).to.be.revertedWith(
                    "Lottery__SendMoreEthToEnterLottery"
                )
            })

            it("record's player when they enter", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee});
                const contractPlayer = await lottery.getPlayer(0);
                assert.equal(player.address, contractPlayer);
            })

            it("emits event on enter", async function () {
                await expect(lottery.enterLottery({ value: lotteryEntranceFee})).to.emit(lottery, 'LotteryEntered');
            })

            it("doesn't allows entrance when lottery is in calculating state", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee});
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.request({ method: "evm_mines", params: []});
                // pretending to be a chainlink operator
                await lottery.performUpkeep([])
                await expect(lottery.enterLottery({ value: lotteryEntranceFee})).to.revertedWith(
                    "Lottery__LotteryNotOpen"
                )
            })
        })

        describe("checkUpKeep", function () {
            it("returns false if people have'nt send any ETH", async function() {
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.request({ method: "evm_mines", params: []});
                const { upKeepNeeded } = await lottery.callstatic.checkUpKeep("0x00");
                assert(!upKeepNeeded);
            })

            it("returns false if lottery isn't open", async () => {
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.request({ method: "evm_mines", params: []});
                await lottery.performUpkeep([])
            })

            it("returns false if enough time hasn't passed", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee});
                await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                await network.provider.request({ method: "evm_mine", params: [] })
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                assert(!upkeepNeeded)
            })

            it("returns true if enough time has passed, has players, eth, and is open", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee});
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.request({ method: "evm_mine", params: [] })
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                assert(upkeepNeeded)
            })
        })

        describe('performUpKeep', () => {
            it("can only run if checkUpKeep is true", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee});
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.request({ method: "evm_mine", params: [] })
                const tx = await lottery.performUpkeep("0x")

                assert(tx);
            })

            it("reverts when perform upkeep is false", async () => {
                await expect(lottery.performUpkeep("0x")).to.be.revertedWith("Lottery__UpkeepNotNeeded")

            })

            it("updates the lottery state", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee});
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.request({ method: "evm_mine", params: [] })
                const txResponse = await lottery.performUpkeep("0x")
                const txReceipt = await txResponse.wait(1)
                const lotteryState = await lottery.getLotteryState()
                const requestId = txReceipt.events[1].args.requestId
                assert(requestId.toNumber() > 0)
                assert(lotteryState == 1) // CALCULATING STATE
            })
        })

        describe('fulfillRandomWords', () => {
            beforeEach(async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee});
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.request({ method: "evm_mine", params: [] })  
            })

            it("can only be called after performUpKeep", async () => {
                await expect(
                    vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address) // reverts if not fulfilled
                ).to.be.revertedWith("nonexistent request")

                await expect(
                    vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address) // reverts if not fulfilled
                ).to.be.revertedWith("nonexistent request")
            })

            it("picks a winner, resets and sends money", async () => {
                const additionalEntrances = 3
                const startingIndex = 2;

                for ( i < startingIndex; i < startingIndex + additionalEntrances; i++) {
                    lottery = lotteryContract.connect(player[i]);
                    await lottery.enterLottery({ value: lotteryEntranceFee});
                }

                const startingTimeStamp = await lottery.getLastTimeStamp();

                await new Promise(async (resolve , reject ) => {
                    lottery.once("Winner Picked", async () => {
                        console.log("Winner Picked Event fired")


                        try {
                          const recentWinner = await lottery.getRecentWinner()
                          const lotteryState = await lottery.getLotteryState()
                          const winnerBalance = await accounts[2].getBalance()
                          const endingTimeStamp = await lottery.getLastTimeStamp()
                          assert.equal(recentWinner.toString(), accounts[2].address)
                              assert.equal(lotteryState, 0)
                              assert.equal(
                                  winnerBalance.toString(), 
                                  startingBalance // startingBalance + ( (lotteryEntranceFee * additionalEntrances) + lotteryEntranceFee )
                                      .add(
                                          lotteryEntranceFee
                                              .mul(additionalEntrances)
                                              .add(lotteryEntranceFee)
                                      )
                                      .toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)  
                              resolve()
                        } catch (error) {
                            reject(error)
                        }
                    })

                    const tx = await lottery.performUpkeep("0x")
                    const txReceipt = await tx.wait(1)
                    const startingBalance = await accounts[2].getBalance()
                    await vrfCoordinatorV2Mock.fulfillRandomWords(
                        txReceipt.events[1].args.requestId,
                        lottery.address
                    )
                })
            })
        })
    })
