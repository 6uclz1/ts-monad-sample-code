export type RawUser = {
  readonly id?: string;
  readonly name?: string;
  readonly email?: string;
  readonly age?: string;
  readonly updatedAt?: string;
};

export type User = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly age: number;
  readonly updatedAt: Date;
};

export type PolicySkip = {
  readonly user: User;
  readonly reason: string;
};
