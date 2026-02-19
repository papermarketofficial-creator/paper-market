import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { SignupSchema } from "@/lib/validation/auth";
import { handleError, ApiError } from "@/lib/errors";
import { WalletService } from "@/services/wallet.service";
import { bootstrapUserLedgerState } from "@/services/ledger-bootstrap.service";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const validated = SignupSchema.parse(body);

        const [existing] = await db
            .select()
            .from(users)
            .where(eq(users.email, validated.email))
            .limit(1);

        if (existing) {
            throw new ApiError("Email already registered", 400, "EMAIL_EXISTS");
        }

        const hashedPassword = await hash(validated.password, 12);

        const [user] = await db
            .insert(users)
            .values({
                name: validated.name,
                email: validated.email,
                password: hashedPassword,
                balance: "1000000.00",
            })
            .returning();

        await db.transaction(async (tx) => {
            await WalletService.createWallet(user.id, tx);
            await bootstrapUserLedgerState(user.id, tx);
        });

        return NextResponse.json(
            {
                success: true,
                data: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                },
                message: "User created successfully",
            },
            { status: 201 }
        );
    } catch (error) {
        return handleError(error);
    }
}
