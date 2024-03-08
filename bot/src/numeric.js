import {ethers} from "ethers";
import {parseUnits} from "@ethersproject/units";
import {getUniv2DataGivenIn} from "./univ2.js";
import {numberRemoveLastZero} from "./utils.js";

const BN_18 = parseUnits("1");

/*
  Binary search to find optimal sandwichable amount

  Using binary search here as the profit function isn't normally distributed
*/
export const binarySearch = (
  left, // Lower bound
  right, // Upper bound
  calculateF, // Generic calculate function
  passConditionF, // Condition checker
  tolerance = parseUnits("0.01") // Tolerable delta (in %, in 18 dec, i.e. parseUnits('0.01') means left and right delta can be 1%)
) => {
  if (right.sub(left).gt(tolerance.mul(right.add(left).div(2)).div(BN_18))) {
    const mid = right.add(left).div(2);
    const out = calculateF(mid);

    if (passConditionF(out)) {
      return binarySearch(mid, right, calculateF, passConditionF, tolerance);
    }

    return binarySearch(left, mid, calculateF, passConditionF, tolerance);
  }

  // No negatives
  const ret = right.add(left).div(2);
  if (ret.lt(0)) {
    return ethers.constants.Zero;
  }

  return ret;
};


export const calcSandwichOptimalIn = (
  userAmountIn,
  userMinRecvToken,
  reserveWeth,
  reserveToken
) => {

  const calcF = (amountIn) => {
    const frontrunState = getUniv2DataGivenIn(
      amountIn,
      reserveWeth,
      reserveToken
    );
    const victimState = getUniv2DataGivenIn(
      userAmountIn,
      frontrunState.newReserveA,
      frontrunState.newReserveB
    );
    return victimState.amountOut;
  };

  const passF = (amountOut) => amountOut.gte(userMinRecvToken);

  const lowerBound = parseUnits("0");
  // TODO：修改成sandwich合约中最多拥有的WETH
  const upperBound = parseUnits("0.05");

  return binarySearch(lowerBound, upperBound, calcF, passF);
};


export const calSandwichState = (
    optimalSandwichWethIn,
    userWethIn,
    userMinRecv,
    reserveWeth,
    reserveToken,
    isWethTokenOne
) => {
  const frontrunState = getUniv2GivenIn(
      optimalSandwichWethIn,
      reserveWeth,
      reserveToken
  )

  // TODO 对前置交易的返回值进行处理
  let frontOut = BigInt(frontrunState.amountOut)
  let frontOutHex = frontOut.toString(16)
  console.log("before front state amount hex , ", frontOutHex)
  if (frontOutHex.length % 2 !== 0) {
    frontOutHex = "0" + frontOutHex
  }
  let str = "0x" + frontOutHex
  frontrunState.amountOut = BigInt(str)

  let originFrontTokenAmount = numberRemoveLastZero(str)

  const victimState = getUniv2GivenIn(
      userWethIn,
      frontrunState.newReserveA,
      frontrunState.newReserveB
  )

  const backrunState = getUniv2GivenIn(
      frontrunState.amountOut,
      victimState.newReserveB,
      victimState.newReserveA
  )

  const right = BigInt(32)
  let backHex = backrunState.amountOut >> right
  if (isWethTokenOne) {
    let l = originFrontTokenAmount.length
    if (l > 6 && originFrontTokenAmount[l - 1] !== "0" && originFrontTokenAmount[l - 2] !== "0") {
      backHex = backHex - BigInt(1)
    }
  } else {
      backHex = backHex - BigInt(1)
  }
  let tmp = "0x" + BigInt(backHex).toString(16) + "00000000"
  let backBigOut =  BigInt(BigInt(tmp).toString(10))

  // js如何去除字符串中后面的0

  if (victimState.amountOut < userMinRecv) {
    return null;
  }

  return {
    revenue: BigInt(backBigOut) - BigInt(optimalSandwichWethIn),
    optimalSandwichWethIn,
    userAmountIn: userWethIn,
    userMinRecv,
    reserveState: {
      reserveWeth,
      reserveToken,
    },
    frontrun: frontrunState,
    victim: victimState,
    backrun: backrunState,
    frontOutHex: str,
    frontOutHexLength: frontOutHex.length,
    backWethHex: backHex,
    tokenAmountOut: originFrontTokenAmount
  };
}


export const getUniv2GivenIn = (aIn, reserveA, reserveB) => {
  const aInWithFee = BigInt(aIn) * BigInt(997);
  const numerator = aInWithFee * BigInt(reserveB);
  const denominator = aInWithFee +  (BigInt(reserveA) * BigInt(1000));
  const bOut = numerator / denominator;

  // Underflow
  let newReserveB = BigInt(reserveB) - BigInt(bOut);
  if (newReserveB < 0  || newReserveB > reserveB) {
    newReserveB = BigInt(1);
  }

  // Overflow
  let newReserveA = BigInt(reserveA) + BigInt(aIn);
  if (newReserveA < reserveA) {
    newReserveA = BigInt(0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff);
  }

  return {
    amountOut: bOut,
    newReserveA,
    newReserveB,
  };
}