import {
    Account,
    Connection,
    BpfLoader,
    BPF_LOADER_PROGRAM_ID,
    PublicKey,
    LAMPORTS_PER_SOL,
    SystemProgram,
    TransactionInstruction,
    Transaction,
    sendAndConfirmTransaction,
    clusterApiUrl,
} from '@solana/web3.js';
// @ts-ignore
import BufferLayout from 'buffer-layout';

const url = clusterApiUrl('devnet')
let connection: Connection

const PROGRAM_ID = 'D5krXNs4Hguw3Rwem2vjaMZZcgtjRxhx6caTwY7WNRiq'
const PROGRAM_PUBLIC_KEY = new PublicKey(PROGRAM_ID)

const greetedAccountDataLayout = BufferLayout.struct([
    BufferLayout.u32('numGreets'),
    BufferLayout.s32('flow')
])
const space = greetedAccountDataLayout.span

export async function establishConnection(): Promise<void> {
    connection = new Connection(url, 'singleGossip')
    const version = await connection.getVersion()
    console.log('Connection to cluster established:', url, version)
}

async function getLastTransactionTime(address: PublicKey) {
    const signatureInfo = await connection.getConfirmedSignaturesForAddress2(address, {
        limit: 1
    })
    const lastSignature = signatureInfo.pop()
    return lastSignature?.blockTime
}

export async function getBalance(account: PublicKey) {
    const accountInfo = await connection.getAccountInfo(account)
    if (accountInfo === null) {
        throw 'Error: cannot find the greeted account'
    }
    const info = greetedAccountDataLayout.decode(Buffer.from(accountInfo.data))
    const staticBal = Number(info.numGreets.toString())
    const flow = Number(info.flow.toString())
    console.log('Static balance', staticBal)
    console.log('Flow', flow)

    const lastTranTime = await getLastTransactionTime(account)
    return {staticBal, flow, lastTranTime}

}

export async function addBalance(address: PublicKey, payerAccount: Account) {
    console.log('Adding balance to', address.toBase58())

    const commandDataLayout = BufferLayout.struct([
        BufferLayout.u8('instruction')
    ])
    let data = Buffer.alloc(1024)
    {
        const encodeLength = commandDataLayout.encode(
            {
                instruction: 1,
            },
            data,
        )
        data = data.slice(0, encodeLength)
    }

    const instruction = new TransactionInstruction({
        keys: [{ pubkey: address, isSigner: false, isWritable: true }],
        programId: PROGRAM_PUBLIC_KEY,
        data,
    })

    const addBalanceResponse = await sendAndConfirmTransaction(
        connection,
        new Transaction().add(instruction),
        [payerAccount],
        {
            commitment: 'singleGossip',
            preflightCommitment: 'singleGossip',
        },
    )
    console.log('Response', addBalanceResponse)
}

export async function startFlow(flow: number, senderPubKey: PublicKey, receiverPubKey: PublicKey, payerAccount: Account) {
    console.log('Creating flow from', senderPubKey.toBase58(), 'to', receiverPubKey.toBase58())

    const commandDataLayout = BufferLayout.struct([
        BufferLayout.u8('instruction'),
        BufferLayout.u8('flow')
    ])
    let data = Buffer.alloc(1024)
    {
        const encodeLength = commandDataLayout.encode(
            {
                instruction: 2,
                flow
            },
            data,
        )
        data = data.slice(0, encodeLength)
    }

    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: senderPubKey, isSigner: false, isWritable: true },
            { pubkey: receiverPubKey, isSigner: false, isWritable: true }
        ],
        programId: PROGRAM_PUBLIC_KEY,
        data, // All instructions are hellos
    })
    const startFlowTransaction = await sendAndConfirmTransaction(
        connection,
        new Transaction().add(instruction),
        [payerAccount],
        {
            commitment: 'singleGossip',
            preflightCommitment: 'singleGossip',
        },
    )
    console.log('Response', startFlowTransaction)
}

export async function createProgramAc(payerAccount: Account) {
    const senderAccount = new Account()
    const senderPubKey = senderAccount.publicKey
    console.log('Creating sender account', senderPubKey.toBase58())

    const lamports = await connection.getMinimumBalanceForRentExemption(
        greetedAccountDataLayout.span,
    )

    const transaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payerAccount.publicKey,
            newAccountPubkey: senderPubKey,
            lamports,
            space,
            programId: PROGRAM_PUBLIC_KEY,
        }),
    )
    const transactionId = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payerAccount, senderAccount],
        {
            commitment: 'singleGossip',
            preflightCommitment: 'singleGossip',
        },
    );
    console.log('Create account transaction ID', transactionId)

    return senderPubKey
}