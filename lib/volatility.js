"use strict";

var riskFreeRate = require("../lib/risk-free-rate"),
    optionChain = require("../lib/option-chain");

// The Cumulative Normal Distribution function
// 0 1 2 -> 0.5000000 0.8413447 0.9772499
function CND(x) {
    var a1 =  0.319381530,
        a2 = -0.356563782,
        a3 =  1.781477937,
        a4 = -1.821255978,
        a5 =  1.330274429,
        p = 0.2316419,
        k;

    if (x < 0.0) {
        return 1 - CND(-x);
    } else {
        k = 1.0 / (1.0 + p * x);
    }

    return 1.0 - Math.exp(-x * x / 2.0) / Math.sqrt(2 * Math.PI) * k *
        (a1 + k * (a2 + k * (a3 + k * (a4 + k * a5))));
}

// The Black and Scholes (1973) Stock option formula
function BS(S, K, T, r, v, type) {
    var d1, d2, value;

    type = type || "C";

    d1 = (Math.log(S / K) + (r + v * v / 2.0) * T) / (v * Math.sqrt(T));
    d2 = d1 - v * Math.sqrt(T);

    if (type === "C") {
        value =  S * CND(d1) - K * Math.exp(-r * T) * CND(d2);
    }
    if (type === "P") {
        value = K * Math.exp(-r * T) * CND(-d2) - S * CND(-d1);
    }

    return value;
}

// Function to find BS Implied Vol using Bisection Method
function impliedVolatility(S, K, T, r, market, type) {
    var sig = 0.20,
        sigUp = 1,
        sigDown = 0.001,
        count = 0,
        err;

    if (market === undefined) {
        return undefined;
    }

    err = BS(S, K, T, r, sig, type) - market;

    // Repeat until error is sufficiently small or counter hits 1000
    while (Math.abs(err) > 0.00001 && count < 1000) {
        if (err < 0) {
            sigDown = sig;
            sig = (sigUp + sig) / 2;
        } else {
            sigUp = sig;
            sig = (sigDown + sig) / 2;
        }
        err = BS(S, K, T, r, sig, type) - market;
        count =  count + 1;
    }

    // return NA if counter hit 1000
    if (count === 1000) {
        return undefined;
    } else {
        return sig;
    }
}

function getImpliedVolatility(params, callback) {
    var symbol, S, T, i, n, cVol = [], pVol = [];

    symbol = params.symbol;

    optionChain.getOptionChainFromYahoo(symbol, function (err, chain) {
        S = chain.strike;
        T = chain.diffdate / 365;
        riskFreeRate.getRiskFreeRateFromYahoo(function (err, r) {
            n = chain.calls.length;
            for (i = 0; i < n; i += 1) {
                cVol[i] = {
                    strike: chain.calls[i].strike,
                    ask: impliedVolatility(S,
                        chain.calls[i].strike, T, r, chain.calls[i].ask, "C"),
                    bid: impliedVolatility(S,
                        chain.calls[i].strike, T, r, chain.calls[i].bid, "C")
                };
            }
            n = chain.puts.length;
            for (i = 0; i < n; i += 1) {
                pVol[i] = {
                    strike: chain.puts[i].strike,
                    ask: impliedVolatility(S,
                        chain.puts[i].strike, T, r, chain.puts[i].ask, "P"),
                    bid: impliedVolatility(S,
                        chain.puts[i].strike, T, r, chain.puts[i].bid, "P")
                };
            }

            callback(err, {
                strike: S,
                riskFree: r,
                expDate: chain.expDateStr,
                callVolatility: cVol,
                putVolatility: pVol
            });
        });
    });
}
exports.getImpliedVolatility = getImpliedVolatility;
