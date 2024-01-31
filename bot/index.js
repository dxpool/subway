import { ethers } from "ethers";
import {
  wssProvider,
  searcherWallet,
  contractProvider,
  WethUsdcPair,
  SwapValue,
  jsonProvider,
  WethMainEthPair, WethUniPair, WethUniV2Pair
} from "./src/constants.js";
import {
  logDebug,
  logError,
  logFatal,
  logInfo,
  logSuccess,
  logTrace,
} from "./src/logging.js";

let count = 0;
const swapExactETHForTokens = async (block_number) => {
  const strLogPrefix = `block_number=${block_number}`
  logTrace(strLogPrefix, "change")
  count++
  if (count < 4) {
    logInfo("!!!return!!!")
    return
  }
  let deadline = parseInt((new Date().getTime() / 1000).toString()) + 600
  let b = await contractProvider.swapExactETHForTokens(0, WethUsdcPair, searcherWallet.address, deadline, {value: SwapValue})
  logInfo("tx_hash is", b.hash)
  count = 0
};


const main = async () => {
  const {chainId} = await jsonProvider.getNetwork()
  console.log("---chainId---", chainId)
  let DxEthContract =  "0x8fF482dFebe8678DcE04c0dA968561758a172A4f"
  // let DxEthContract = "0x37271e354d96e7e75B5ddd48F4B3718514b24567"
  let domain = {
    name: "DxPool Liquid Staking",
    version: "1",
    chainId: chainId,
    verifyingContract: DxEthContract
  }

  let typeRecord = {
    Permit: [
      {name: 'owner', type: 'address'},
      {name: 'spender', type: 'address'},
      {name: 'value', type: 'uint256'},
      {name: 'nonce', type: 'uint256'},
      {name: 'deadline', type: 'uint256'}
    ]
  }

  // nonce 需要单独获取
  let DxStakingContract = "0x03882B8340632859bee5c0A95fcBc898b020Fca7"
  let value = {
    owner: '0x638A2789566c2d3C7801D6ABC155345613737328',
    spender: DxStakingContract,
    value: 1000000,
    nonce: 1,
    deadline: 1706675822
  }
  // const web3 = new ethers.providers.Web3Provider(jsonProvider)
  // web3.getSigner()._signTypedData()

  const sign = await searcherWallet._signTypedData(domain, typeRecord, value)

  let part = ethers.utils.splitSignature(sign)
  console.log("signature: ", part)
};

main();