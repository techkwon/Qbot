import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { z } from 'zod';

// Initialize OpenAI client
// Ensure OPENAI_API_KEY is set in your environment variables (.env.local)
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Input validation schema
const scenarioRequestSchema = z.object({
    topic: z.string().min(10, 'Topic description must be at least 10 characters long.'),
    // Optional: Add more parameters like target audience, desired tone, etc.
});

export async function POST(request: Request) {
    const cookieStore = cookies();
    const supabase = createServerClient(cookieStore);

    // 1. User Authentication (Optional but recommended)
    // Although generating text might not directly modify sensitive data,
    // restricting access to authenticated users (teachers) is good practice.
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        console.error('Authentication error for AI scenario generation:', authError);
        // Decide if this should be a hard block or allow unauthenticated (not recommended)
        // For now, we block unauthorized access.
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        // TODO: Optionally, verify if the user is a teacher if needed.
    }

    // 2. Parse and validate request body
    let validatedData;
    try {
        const body = await request.json();
        validatedData = scenarioRequestSchema.parse(body);
    } catch (error) {
        console.error('Request body parsing/validation error:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { topic } = validatedData;

    // 3. Call OpenAI API
    try {
        // Construct the prompt for OpenAI
        const systemMessage = `You are an expert assistant helping a teacher design an engaging educational chatbot. 
Your task is to generate a concise and effective system prompt (base_prompt) for a chatbot based on the provided topic or learning objectives. 

The system prompt should guide the chatbot to:
- Introduce itself briefly and state its purpose related to the topic.
- Engage the student in a natural, conversational manner.
- Encourage the student to explain their understanding, ask questions, or discuss the topic.
- Avoid simply lecturing or providing answers directly unless asked or necessary for guidance.
- Maintain a supportive and encouraging tone.
- Focus the conversation on the core learning objectives described by the teacher.

Generate ONLY the system prompt text itself, without any introductory phrases like "Here is the system prompt:".`;

        const userMessage = `Teacher's Topic/Objectives: ${topic}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // Or use a more advanced model like gpt-4o if preferred
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: userMessage },
            ],
            temperature: 0.7, // Adjust creativity
            max_tokens: 300, // Limit response length
            n: 1,
        });

        const generatedPrompt = completion.choices[0]?.message?.content?.trim();

        if (!generatedPrompt) {
            throw new Error('OpenAI did not return a valid prompt.');
        }

        // 4. Return the generated prompt
        return NextResponse.json({ generatedPrompt }, { status: 200 });

    } catch (error: any) {
        console.error('OpenAI API call failed:', error);
        // Provide a more specific error message if possible
        let errorMessage = 'Failed to generate scenario.';
        if (error.response?.data?.error?.message) {
            errorMessage = `OpenAI Error: ${error.response.data.error.message}`;
        } else if (error.message) {
             errorMessage = error.message;
        }
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

// Basic OPTIONS handler
export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
} 