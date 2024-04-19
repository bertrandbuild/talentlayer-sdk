import { TransactionHash } from '../types';

export interface IDispute {
  getArbitrationCost(platformId?: number): Promise<any>;
  setPrice(value: number | string): Promise<TransactionHash>;
}
