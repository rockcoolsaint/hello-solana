import {
  Keypair,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import fs from 'mz/fs';
import path from 'path';
import dotenv from 'dotenv';

// dot env config
dotenv.config();

/*
  Our keypair we used to create the on-chain Rust program
*/
const PROGRAM_KEYPAIR_PATH = path.join(
  path.resolve(__dirname, '../../dist/program'),
  'hello_solana-keypair.json'
);

async function confirmWithRetry(connection: Connection, signature: string, retries = 5, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Checking transaction confirmation... Attempt ${i + 1}`);
      const response = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
      if (response?.value?.confirmationStatus === "finalized") {
        console.log("Transaction confirmed!");
        return;
      }
    } catch (error) {
      console.warn(`Retrying in ${delay}ms...`);
      await new Promise(res => setTimeout(res, delay));
      delay *= 2; // Exponential backoff
    }
  }
  throw new Error(`Transaction ${signature} failed to confirm.`);
}


async function main() {

  console.log("Launching client...");

  /*
  Connect to Solana DEV net
  */
  // let connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  let connection = new Connection(`https://solana-devnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`, 'finalized');

  /*
  Get our program's public key
  */
  const secretKeyString = await fs.readFile(PROGRAM_KEYPAIR_PATH, {encoding: 'utf8'});
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  const programKeypair = Keypair.fromSecretKey(secretKey);
  let programId: PublicKey = programKeypair.publicKey;

  /*
  Generate an account (keypair) to transact with our program
  */
  const triggerKeypair = Keypair.generate();
  const airdropRequest = await connection.requestAirdrop(
    triggerKeypair.publicKey,
    LAMPORTS_PER_SOL,
  );
  await confirmWithRetry(connection, airdropRequest);

  /*
  Conduct a transaction with our program
  */
  console.log('--Pinging Program ', programId.toBase58());
  const instruction = new TransactionInstruction({
    keys: [{pubkey: triggerKeypair.publicKey, isSigner: false, isWritable: true}],
    programId,
    data: Buffer.alloc(0),
  });

  // Fetch latest blockhash
  const latestBlockhash = await connection.getLatestBlockhash();

  // const transaction = new Transaction({
  //   recentBlockhash: latestBlockhash.blockhash,
  //   feePayer: triggerKeypair.publicKey,
  // }).add(instruction);

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = triggerKeypair.publicKey;
  transaction.recentBlockhash = latestBlockhash.blockhash;
  
  // await sendAndConfirmTransaction(
  //   connection,
  //   new Transaction().add(instruction),
  //   [triggerKeypair],
  // );
  await sendAndConfirmTransaction(
    connection,
    transaction,
    [triggerKeypair],
  );
}

main().then(
  () => process.exit(),
  err => {
    console.error(err);
    process.exit(-1);
  },
);