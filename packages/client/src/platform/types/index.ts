import { Hash } from 'viem';
import { ClientTransactionResponse, NetworkEnum, TransactionHash } from '../../types';

export type PlatformDetails = {
  about: string;
  website: string;
  video_url: string;
  image_url: string;
  [key: string]: any;
};

export type Arbitrator = {
  address: Hash;
  name: string;
};

export interface IPlatform {
  getOne(id: string): Promise<any>;
  update(data: PlatformDetails, platformId?: number): Promise<ClientTransactionResponse>;
  updateOriginServiceFeeRate(value: number, platformId?: number): Promise<TransactionHash>;
  updateOriginValidatedProposalFeeRate(value: number, platformId?: number): Promise<TransactionHash>;
  updateServicePostingFee(value: number, platformId?: number): Promise<TransactionHash>;
  updateProposalPostingFee(value: number, PlatformId?: number): Promise<TransactionHash>;
  getByOwner(address: `0x${string}`): Promise<any>;
  mint(platformName: string): Promise<TransactionHash>;
  mintForAddress(platformName: string, address: string, mintFee: any): Promise<TransactionHash>;
  setFeeTimeout(timeout: number, platformId?: number): Promise<TransactionHash>;
  getArbitrators(chainId: NetworkEnum): Arbitrator[];
  updateArbitrator(address: `0x${string}`, platformId?: number): Promise<TransactionHash>;
}
