import { MongoClient } from "mongodb";

let client: MongoClient | null = null;

export function getMongoClient(url: string): MongoClient {
	if (!client) {
		client = new MongoClient(url);
	}
	return client;
}

export async function closeMongoClient(): Promise<void> {
	if (client) {
		await client.close();
		client = null;
	}
}
