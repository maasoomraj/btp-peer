const bodyParser = require("body-parser");
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

const PubSub = require("./app/pubsub");
const Blockchain = require("./blockchain/index");
const path = require("path");
const TransactionPool = require("./wallet/transaction-pool");
const Transaction = require("./wallet/transaction");
const Wallet = require("./wallet/index");
const TransactionMiner = require("./app/transaction-miner");
const { SENDER_INPUT } = require("./util/index");
const ip = require("ip");
const Peer = require("./app/peer");
const got = require("got");
const fs = require("fs");

// Routes
const authRoute = require("./routes/auth");

dotenv.config();
mongoose.connect(
  process.env.MONGO_DB,
  { useNewUrlParser: true, useUnifiedTopology: true },
  () => console.log("Connected to DB")
);

const isDevelopment = process.env.ENV === "development";
const REDIS_URL = isDevelopment
  ? "redis://127.0.0.1:6379"
  : "redis://h:p2e12ac66333126401be49042ceb7484d6af7d3d3f946bcc1545fa177b55328f3@ec2-54-145-84-202.compute-1.amazonaws.com:26739";
const DEFAULT_PORT = 3001;
const ROOT_NODE_ADDRESS = `https://vast-thicket-16737.herokuapp.com`;

const app = express();

let isLoggedIn = false;
let blockchain, transactionPool, wallet, peer, pubsub, transactionMiner;

blockchain = new Blockchain();
transactionPool = new TransactionPool();
peer = new Peer();
pubsub = new PubSub({ blockchain, transactionPool, peer, redisUrl: REDIS_URL });

//JASH CODE BELOW -
app.use(express.static(path.join(__dirname, "client/dist")));
//JASH CODE ABOVE -

console.log("ROOT_NODE_ADDRESS - " + ROOT_NODE_ADDRESS);

app.use(bodyParser.json());
app.use("/api/user", authRoute);

app.get("/createUser", (req, res) => {
  if (isLoggedIn == false) {
    if (PORT !== DEFAULT_PORT) {
      syncChains();
      syncTransactionPool();
      syncPeerList();
    }

    wallet = new Wallet();
    transactionMiner = new TransactionMiner({
      blockchain,
      transactionPool,
      wallet,
      pubsub,
    });

    console.log("Created User Successfully !");

    isLoggedIn = true;

    var details = JSON.stringify(wallet);

    // console.log(wallet);
    // console.log("--------------------------------------------------------------------------------------------------------");
    // console.log(JSON.parse(details));
    // console.log(JSON.parse(JSON.stringify(details)) instanceof Wallet);
    // console.log(wallet instanceof Wallet);
    // console.log(Object.assign('Wallet', JSON.parse(details)) instanceof Wallet);
    // fs.writeFileSync(path.join(__dirname, '/client/src/assets/', 'MyWallet.txt'), details);

    res.send({ wallet: details });
  }
});

app.get("/logout", (req, res) => {
  if (isLoggedIn == true) {
    isLoggedIn = false;

    console.log("Logout successful !");
  }
});

app.post("/login", (req, res) => {
  if (isLoggedIn == true) {
    res.json({
      isLoggedIn: isLoggedIn,
    });
  } else {
    const { jsonObj } = req.body;
    // console.log(jsonObj.balance);

    console.log(JSON.parse(jsonObj).publicKey);
    // let MyWallet;

    if (PORT !== DEFAULT_PORT) {
      syncChains();
      syncTransactionPool();
      syncPeerList();
    }

    // MyWallet = JSON.parse(data);
    // wallet = JSON.parse(JSON.stringify(jsonObj));

    // Edited-
    wallet = JSON.parse(jsonObj);

    // wallet = Object.assign(new Wallet, JSON.parse(jsonObj))

    console.log(wallet instanceof Wallet);
    transactionMiner = new TransactionMiner({
      blockchain,
      transactionPool,
      wallet,
      pubsub,
    });

    wallet.balance = Wallet.calculateBalance({
      chain: blockchain.chain,
      address: wallet.publicKey,
    });

    isLoggedIn = true;

    var details = JSON.stringify(wallet);
    // fs.writeFileSync(path.join(__dirname, '/client/src/components/files/', 'MyWallet.txt'), details);

    console.log("Login Successful !");
    console.log(wallet.publicKey);
    res.json({
      isLoggedIn: isLoggedIn,
      wallet: wallet.publicKey,
    });
  }
});

app.get("/api/blocks", (req, res) => {
  res.json({
    chain: blockchain.chain,
    isLoggedIn: isLoggedIn,
  });
});

app.get("/api/peer", (req, res) => {
  res.json({
    peer: peer.peersList,
    isLoggedIn: isLoggedIn,
  });
});

app.post("/api/mine", (req, res) => {
  const { data } = req.body;

  blockchain.addBlock({ data: data });

  pubsub.broadcastChain();

  res.redirect("/api/blocks");
});

app.post("/api/send", (req, res) => {
  const { input } = req.body;
  input.from = wallet.publicKey;
  input.timestamp = Date.now();
  input.address = SENDER_INPUT.sender_address;

  const outputMap = { [SENDER_INPUT.receiver_address]: SENDER_INPUT.reward };

  const transaction = new Transaction({ input: input, outputMap: outputMap });

  pubsub.broadcastTransaction(transaction);

  transactionPool.setTransaction(transaction);

  res.redirect("/api/transactionPoolMap");
});

app.post("/api/receive", (req, res) => {
  const { input } = req.body;

  input.to = wallet.publicKey;
  input.timestamp = Date.now();
  input.address = SENDER_INPUT.receiver_address;
  const outputMap = { [SENDER_INPUT.sender_address]: SENDER_INPUT.reward };
  const transaction = new Transaction({ input: input, outputMap: outputMap });

  pubsub.broadcastTransaction(transaction);
  transactionPool.setTransaction(transaction);

  res.redirect("/api/transactionPoolMap");
});

app.post("/api/transact", (req, res) => {
  const { amount, recipient } = req.body;

  console.log(amount);
  console.log(recipient);
  console.log(blockchain.chain);
  console.log(wallet instanceof Wallet);

  let transaction = transactionPool.existingTransaction({
    inputAddress: wallet.publicKey,
  });

  try {
    if (transaction) {
      transaction.update({
        senderWallet: wallet,
        recipient: recipient,
        amount: amount,
      });
    } else {
      transaction = wallet.createTransaction({
        amount: amount,
        recipient: recipient,
        chain: blockchain.chain,
      });
    }
  } catch (error) {
    return res.status(400).json({ type: "error", message: error.message });
  }

  pubsub.broadcastTransaction(transaction);

  transactionPool.setTransaction(transaction);

  res.redirect("/api/transactionPoolMap");
});

app.post("/api/trace", (req, res) => {
  const { product } = req.body;
  console.log("Tracing for product " + product + " ...");

  let traceArray = [];

  for (let i = 1; i < blockchain.chain.length; i++) {
    const block = blockchain.chain[i];
    for (let transaction of block.data) {
      if (
        transaction.input.address === SENDER_INPUT.sender_address ||
        transaction.input.address === SENDER_INPUT.receiver_address
      ) {
        if (transaction.input.product === product) {
          let found = 0;
          for (let j = 0; j < traceArray.length; j++) {
            if (traceArray[j] == transaction.input.from) {
              found = 1;
              break;
            }
          }

          if (found == 0) {
            traceArray.push(transaction.input.from);
          }

          found = 0;
          for (let j = 0; j < traceArray.length; j++) {
            if (traceArray[j] == transaction.input.to) {
              found = 1;
              break;
            }
          }

          if (found == 0) {
            traceArray.push(transaction.input.to);
          }
        }
      }
    }
  }
  res.json({
    traceArray: traceArray,
    isLoggedIn: isLoggedIn,
  });
});

app.get("/api/transactionPoolMap", (req, res) => {
  res.json({
    transactionPool: transactionPool.transactionMap,
    isLoggedIn: isLoggedIn,
  });
});

app.get("/api/mine-transactions", (req, res) => {
  transactionMiner.mineTransactions();

  // PEER ADD -
  // pubsub.broadcastPeer(myIp);
  // peer.addPeer(myIp);
  // console.log("Ip " + myIp + " has been added to peersList.");
});

app.get("/api/wallet-info", (req, res) => {
  const address = wallet.publicKey;

  res.json({
    address: address,
    balance: Wallet.calculateBalance({
      chain: blockchain.chain,
      address: address,
    }),
    isLoggedIn: isLoggedIn,
  });
});

// JASH CODE BELOW -
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client/dist/index.html"));
});
// JASH CODE ABOVE -

const syncChains = async () => {
  try {
    const response = await got(`${ROOT_NODE_ADDRESS}/api/blocks`);

    console.log("Syncing Chain ....");
    const rootchain = JSON.parse(response.body);
    blockchain.replaceChain(rootchain);
    console.log("Chain Synced.");
  } catch (error) {
    // console.log(error.response.body);
    console.log("ERROR : Couldn't sync chain...");
  }
};

const syncTransactionPool = async () => {
  try {
    const response = await got(`${ROOT_NODE_ADDRESS}/api/transactionPoolMap`);

    console.log("Syncing TransactionPool ....");
    const rootTransactionPool = JSON.parse(response.body);
    transactionPool.setMap(rootTransactionPool);
    console.log("TransactionPool Synced.");
  } catch (error) {
    console.log("ERROR : Couldn't sycn Transaction Pool...");
    // console.log(error.response.body);
  }
};

// REQUEST MODULE
// const syncPeerList = ()=>{
//     request({ url : `${ROOT_NODE_ADDRESS}/api/peer`}, (error, response, body)=>{
//         if(!error && response.statusCode === 200){
//             const rootPeersList = JSON.parse(body);
//             console.log("rootPeersList - " + rootPeersList);

//             peer.setPeerList(rootPeersList);
//         }
//     });
// };

const syncPeerList = async () => {
  try {
    const response = await got(`${ROOT_NODE_ADDRESS}/api/peer`);

    console.log("Syncing PeersList ....");
    const rootPeersList = JSON.parse(response.body);
    peer.setPeerList(rootPeersList);
    console.log("PeersList Synced.");
  } catch (error) {
    // console.log(error.response.body);
    console.log("Coudln't sync Peer List");
  }
};

// JASH CODE BELOW -
// const walletFoo = new Wallet();
// const walletBar = new Wallet();

// const generateWalletTransaction = ({ wallet,recipient,amount }) => {
//     const transaction = wallet.createTransaction({
//         recipient,amount,chain: blockchain.chain
//     });

//     transactionPool.setTransaction(transaction);

// };

// const walletAction = () => generateWalletTransaction({
//     wallet, recipient: walletFoo.publicKey, amount:5
// });

// const walletFooAction = () => generateWalletTransaction({
//     wallet: walletFoo , recipient: walletBar.publicKey, amount:10
// });

// const walletBarAction = () => generateWalletTransaction({
//     wallet: walletBar ,  recipient: wallet.publicKey, amount:15
// });

// for (let i=0; i<3; i++) {
//     if (i%3 === 0) {
//         walletAction();
//         walletFooAction();
//     } else if (i%3 === 1) {
//         walletAction();
//         walletBarAction();
//     } else {
//         walletFooAction();
//         walletBarAction();
//     }

//     transactionMiner.mineTransactions();
// }
// JASH CODE ABOVE -

let PEER_PORT;

if (process.env.GENERATE_PEER_PORT === "true") {
  PEER_PORT = DEFAULT_PORT + Math.ceil(Math.random() * 1000);
}

const PORT = process.env.PORT || PEER_PORT || DEFAULT_PORT;
app.listen(`${PORT}`, () => {
  console.log(`Listening at port ${PORT}`);
  // if(PORT !== DEFAULT_PORT){
  //     syncChains();
  //     syncTransactionPool();
  // }

  // if(myIp !== `${SERVER_IP_ADDRESS}`){
  // // if(PORT !== DEFAULT_PORT){
  //     // myIp = "123.12.12.12";
  //     syncChains();
  //     syncTransactionPool();
  //     syncPeerList();
  // }else{
  //     pubsub.broadcastPeer(myIp);
  //     peer.addPeer(myIp);
  //     console.log("Ip " + myIp + " has been added to peersList.");
  // }
});
