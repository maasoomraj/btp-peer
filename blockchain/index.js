const Block = require('./block');
const Transaction = require('../wallet/transaction');
const Wallet = require('../wallet/index');
const {REWARD_INPUT , MINING_REWARD, SENDER_INPUT} = require('../util/index');

class BlockChain
{
    constructor()
    {
        this.chain = [Block.genesis()];
    }

    addBlock({data})
    {
        const block = Block.mineBlock(this.chain[this.chain.length - 1], data);
        this.chain.push(block);

        return block;
    }

    isValidChain(chain)
    {
        if(JSON.stringify(chain[0]) !== JSON.stringify(Block.genesis()))
            return false;


        for(var i=1;i<chain.length;i++)
        {
            const presentBlock = chain[i];
            const lastBlock = chain[i-1];

            if(presentBlock.lastHash !== lastBlock.hash || presentBlock.hash !== Block.hashBlock(presentBlock))
                return false;
        }

        return true;
    }

    replaceChain(newChain, validateTransaction , onSuccess)
    {
        if(newChain.length <= this.chain.length)
        {
            console.log("Chain is smaller. Thus can't be replaced");
            return;
        }
        else if(!this.isValidChain(newChain))
        {
            console.log("Chain is not a valid chain. Corrupt chain. Can't replace.")
            return;
        }

        if(validateTransaction && !this.validTransactionData({ chain : newChain })){
            console.log("Chain has invalid transaction data.")
            return;
        }

        if(onSuccess){
            onSuccess();
        }

        console.log("Replacing New Chain");
        this.chain = newChain;
        return;
    }

    validTransactionData({ chain }){
        for(let i=1; i<chain.length ; i++){
            const block = chain[i];
            const transactionSet = new Set();
            let numberRewardTransaction = 0;
            let numberTransaction =0;

            for(let transaction of block.data){
                numberTransaction+=1;

                if(transaction.input.address === SENDER_INPUT.address){
                    // console.log("transaction-validTransactionData");
                }else if(transaction.input.address === REWARD_INPUT.address){
                    numberRewardTransaction+=1;

                    if(numberRewardTransaction > 1){
                        console.log("FALSE blockchain-index-validTransactionData 1");
                        return false;
                    }

                    if(Object.values(transaction.outputMap)[0] !== MINING_REWARD){
                        console.log("FALSE blockchain-index-validTransactionData 2");
                        return false;
                    }
                }else{
                    if(!Transaction.validTransaction(transaction)){
                        console.log("FALSE blockchain-index-validTransactionData 3");
                        return false;
                    }

                    const trueBalance = Wallet.calculateBalance({
                        chain : this.chain,
                        address : transaction.input.address
                    });

                    if(transaction.input.amount !== trueBalance){
                        console.log("");
                        console.log(transaction);
                        console.log("FALSE blockchain-index-validTransactionData 4");
                        return false;
                    }

                    if(transactionSet.has(transaction)){
                        console.log("FALSE blockchain-index-validTransactionData 5");
                        return false;
                    }else{
                        transactionSet.add(transaction);
                    }
                }

            }

            if(numberTransaction <= numberRewardTransaction){
                console.log(transactionSet.size);
                console.log("FALSE blockchain-index-validTransactionData 6");
                return false;
            }
        }

        return true;
    }
}

module.exports = BlockChain;