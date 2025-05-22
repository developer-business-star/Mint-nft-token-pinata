// src/mint-nft.ts
import 'dotenv/config';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { keypairIdentity, generateSigner, percentAmount } from '@metaplex-foundation/umi';
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters';
import { web3 } from '@coral-xyz/anchor';
import bs58 from 'bs58';
//upload to ipfs
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";

const PINATA_API_KEY = '8f35f2be13a2122b086c';
const PINATA_SECRET_API_KEY = '1d16b9e6baca556b70f45714f4823518cc15b69ab4139a6d0bbb2fd54c86fc1b';

let metadataUrl: string;

//mint nft
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not found in .env");

const secretKey = bs58.decode(PRIVATE_KEY);
const keypair = web3.Keypair.fromSecretKey(secretKey);

// Create the UMI client for devnet and use Metaplex plugin
const umi = createUmi('https://api.devnet.solana.com').use(mplTokenMetadata());
umi.use(keypairIdentity(fromWeb3JsKeypair(keypair)));

//upload to ipfs
async function uploadFileToPinata(filePath: string): Promise<string> {
  const data = new FormData();
  data.append("file", fs.createReadStream(filePath));

  const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", data, {
    maxBodyLength: Infinity,
    headers: {
      ...data.getHeaders(),
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_API_KEY,
    },
  });

  const ipfsHash = res.data.IpfsHash;
  console.log(`Uploaded ${filePath} to IPFS: ${ipfsHash}`);
  return ipfsHash;
}

async function uploadMetadataToPinata(metadata: any): Promise<string> {
  const res = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", metadata, {
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_API_KEY,
    },
  });

  const ipfsHash = res.data.IpfsHash;
  console.log(`Uploaded metadata to IPFS: ${ipfsHash}`);
  return ipfsHash;
}
//upload metadata and image to ipfs and mint nft
async function main() {
  const imagePath = path.join(__dirname, "../assets/nft.png");

  // 1. Upload image
  const imageHash = await uploadFileToPinata(imagePath);
  const imageUrl = `https://ipfs.io/ipfs/${imageHash}`;

  // 2. Create metadata JSON
  let tokenName = "New First Token";
  let tokenDescription = "This is my new NFT Token!";
  let symbol = "sym";
  let price = 150;
  const metadata = {
    name: tokenName,
    description: tokenDescription,
    symbol: symbol,
    price: price,
    image: imageUrl,
    attributes: [{ trait_type: "Coolness", value: "100" }],
  };

  // 3. Upload metadata JSON
  const metadataHash = await uploadMetadataToPinata(metadata);
  metadataUrl = `https://ipfs.io/ipfs/${metadataHash}`;
  console.log('🦴Metadata URL🦴', metadataUrl);

  // Generate a new mint address
  const mint = generateSigner(umi);

  const tx = await createNft(umi, {
    mint,
    name: tokenName,
    symbol: symbol,
    uri: metadataUrl,
    sellerFeeBasisPoints: percentAmount(5), // 5%
    creators: [
      {
        address: umi.identity.publicKey,
        verified: true,
        share: 100,
      },
    ],
  }).sendAndConfirm(umi);

  console.log('✅ NFT Minted Successfully!');
  console.log('Transaction Signature:', tx.signature);
  console.log('Mint Address:', mint.publicKey.toString());
}

main().catch((err) => {
  console.error("Upload failed:", err);
});