'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { v4 as uuidv4 } from 'uuid'
import OpenAI from 'openai'
import { cookies } from 'next/headers' // Import cookies
import { type Message } from './ChatInterface' // Import the type from the client component

// Initialize OpenAI client
// Ensure OPENAI_API_KEY is set in your .env.local
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to find or create conversation
async function findOrCreateConversation(supabase: ReturnType<typeof createClient>, chatbotSlug: string, userId: string): Promise<string | null> {
  try {
    console.log('--- Finding chatbot with slug:', chatbotSlug);

    // 1. Find the chatbot_id from the slug
    const { data: chatbotData, error: chatbotError } = await supabase
      .from('chatbots')
      .select('id')
      .eq('slug', chatbotSlug)
      .single();

    if (chatbotError || !chatbotData) {
      console.error('Error finding chatbot:', chatbotError);
      return null; // Or throw an error
    }
    const chatbotId = chatbotData.id;

    // 2. Find existing conversation
    const { data: convData, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('chatbot_id', chatbotId)
      .eq('student_id', userId)
      .single();

    if (convData) {
      return convData.id; // Return existing conversation ID
    }

    // 3. If not found, create a new conversation
    if (convError && convError.code === 'PGRST116') { // PGRST116: 'JWTRefreshFailed' - No rows returned
      const { data: newConvData, error: newConvError } = await supabase
        .from('conversations')
        .insert({ chatbot_id: chatbotId, student_id: userId })
        .select('id')
        .single();

      if (newConvError) {
        console.error('Error creating conversation:', newConvError);
        return null;
      }
      return newConvData.id;
    } else if (convError) {
      console.error('Error finding conversation:', convError);
      return null;
    }

    return null; // Should not happen
  } catch (error) {
    console.error('Error in findOrCreateConversation:', error);
    return null;
  }
}

export async function sendMessage(
  options: { chatbotSlug: string }, 
  userMessageText: string
): Promise<Message | { error: string }> {
  // --- Log arguments immediately upon entry --- 
  console.log('--- sendMessage Server Action received ---');
  console.log('Argument chatbotSlug:', options.chatbotSlug); 
  console.log('Argument userMessageText:', userMessageText);
  // -----------------------------------------

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore)

  // 1. Get user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: 'User not authenticated' };
  }

  // 2. Find or create conversation
  const conversationId = await findOrCreateConversation(supabase, options.chatbotSlug, user.id);
  if (!conversationId) {
    return { error: 'Could not find or create conversation' };
  }

  // 3. Save user message to DB
  const { error: userMsgError } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_role: 'user',
    content: userMessageText,
  });

  if (userMsgError) {
    console.error('Error saving user message:', userMsgError);
    // Continue to get bot response, but log the error
  }

  try {
    // Construct messages for OpenAI by combining context and user message
    const messages = [
      { role: 'system' as const, content: `You are a chat assistant named ${options.chatbotSlug}.` },
      { role: 'user' as const, content: userMessageText },
    ];

    // Make OpenAI API call
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Or use the model specified in chatbot config later
      messages: messages,
      max_tokens: 1000,
    });

    const botResponseText = completion.choices[0]?.message?.content;

    if (!botResponseText) {
      throw new Error('No response from OpenAI');
    }

    // 5. Save bot message to DB
    const botResponseId = crypto.randomUUID();
    const { data: botMsgData, error: botMsgError } = await supabase.from('messages').insert({
      id: botResponseId,
      conversation_id: conversationId,
      content: botResponseText,
      sender: 'bot',
      created_at: new Date().toISOString(),
    }).select('id, created_at').single(); // Get id and timestamp

    if (botMsgError) {
      console.error('Error saving bot message:', botMsgError);
      return { error: 'Failed to save bot response' }; 
    }

    // Revalidate the chat page path to potentially update server components (if any depend on messages)
    revalidatePath(`/chat/${options.chatbotSlug}`);

    // 6. Return the bot message object for UI update
    const botResponseMessage: Message = {
      id: botMsgData.id, 
      content: botResponseText, // Use 'content'
      sender: 'bot',
      conversation_id: conversationId,
      created_at: botMsgData.created_at, // Use created_at (string) from DB
    };

    return botResponseMessage;
  } catch (aiError: any) {
    console.error('OpenAI API error:', aiError);
    return { error: `AI error: ${aiError.message || 'Unknown error'}` };
  }
}
