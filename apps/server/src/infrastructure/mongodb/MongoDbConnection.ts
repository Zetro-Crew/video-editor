// TODO (Requires-Network-Change): MONGODB_URI must point to the internal MongoDB instance

import { Logger } from "@ztube/observability";
import { type Db, MongoClient } from "mongodb";

export interface MongoDbConfig {
	uri: string;
	dbName: string;
}

export class MongoDbConnection {
	private client: MongoClient;
	private db: Db | null = null;

	constructor(config: MongoDbConfig) {
		this.client = new MongoClient(config.uri);
		this.dbName = config.dbName;
	}

	private readonly dbName: string;

	async connect(): Promise<Db> {
		await this.client.connect();
		this.db = this.client.db(this.dbName);
		Logger.logInfo("[mongodb] connected", { dbName: this.dbName });
		return this.db;
	}

	async disconnect(): Promise<void> {
		await this.client.close();
		this.db = null;
		Logger.logInfo("[mongodb] disconnected");
	}

	getDb(): Db {
		if (!this.db) throw new Error("MongoDB not connected — call connect() first");
		return this.db;
	}
}
