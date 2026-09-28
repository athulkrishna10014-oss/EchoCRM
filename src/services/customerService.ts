import { supabase } from '../supabase/client'
import { Customer } from '../types'

interface GetCustomersResponse {
  customers: Customer[];
  totalCount: number;
  hasNextPage: boolean;
}

/**
 * Handle database errors safely by translating them into user-friendly messages.
 */
function handleCustomerError(error: any, fallbackMessage: string): Error {
  console.error(error);
  const msg = error?.message || '';
  if (msg.includes('Failed to fetch') || msg.includes('TypeError')) {
    return new Error('Unable to connect to database. Please check your connection.');
  }
  if (msg.includes('violates foreign key constraint') || msg.includes('violates check constraint')) {
    return new Error('Invalid input values provided. Please double check customer details.');
  }
  return new Error(fallbackMessage);
}

/**
 * Fetch a paginated, sorted, and searched list of customers.
 */
export async function getCustomers(
  page: number,
  limit: number = 20,
  search: string = '',
  sortOrder: 'asc' | 'desc' = 'asc'
): Promise<GetCustomersResponse> {
  try {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .order('name', { ascending: sortOrder === 'asc' })
      .range(from, to);

    // Apply OR filter search across name, email, company, or phone number
    if (search.trim() !== '') {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},email.ilike.${term},company.ilike.${term},phone.ilike.${term}`);
    }

    const { data, count, error } = await query;

    if (error) {
      throw handleCustomerError(error, 'Unable to load customers from database.');
    }

    const customers = data || [];
    const totalCount = count || 0;
    const hasNextPage = from + customers.length < totalCount;

    return {
      customers,
      totalCount,
      hasNextPage,
    };
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while fetching customers.');
  }
}

/**
 * Create a new customer profile.
 * Automatically injects the owner_id from the active authenticated session.
 */
export async function createCustomer(
  cust: Omit<Customer, 'id' | 'created_at' | 'owner_id'>
): Promise<Customer> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('You must be signed in to create a customer.');
    }

    const { data, error } = await supabase
      .from('customers')
      .insert({
        owner_id: user.id,
        name: cust.name.trim(),
        email: cust.email?.trim() || null,
        phone: cust.phone?.trim() || null,
        company: cust.company?.trim() || null,
        tags: cust.tags || [],
      })
      .select()
      .single();

    if (error) {
      throw handleCustomerError(error, 'Customer could not be created. Please try again.');
    }

    return data;
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while creating customer.');
  }
}

/**
 * Update an existing customer profile.
 */
export async function updateCustomer(
  id: string,
  cust: Partial<Omit<Customer, 'id' | 'created_at' | 'owner_id'>>
): Promise<Customer> {
  try {
    const updateData: any = {};
    if (cust.name !== undefined) updateData.name = cust.name.trim();
    if (cust.email !== undefined) updateData.email = cust.email?.trim() || null;
    if (cust.phone !== undefined) updateData.phone = cust.phone?.trim() || null;
    if (cust.company !== undefined) updateData.company = cust.company?.trim() || null;
    if (cust.tags !== undefined) updateData.tags = cust.tags;

    const { data, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw handleCustomerError(error, 'Customer details could not be updated.');
    }

    return data;
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while updating customer.');
  }
}

/**
 * Delete a customer profile.
 */
export async function deleteCustomer(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) {
      throw handleCustomerError(error, 'Customer could not be deleted.');
    }
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('An unexpected error occurred while deleting customer.');
  }
}

// ---------------------------------------------------------------------------
// Temporary Customer Management (used when NO manual customer was supplied)
// ---------------------------------------------------------------------------

/**
 * Check if a customer record is a temporary placeholder created before audio processing.
 */
export function isTemporaryCustomer(cust: { name?: string | null; tags?: string[] | null }): boolean {
  if (!cust) return false;
  if (cust.tags && (cust.tags.includes('temporary') || cust.tags.includes('auto-detected'))) {
    return true;
  }
  if (cust.name && cust.name.startsWith('Unknown Customer - ')) {
    return true;
  }
  return false;
}

/**
 * Create a new temporary customer profile immediately before audio upload or recording.
 * Provides a stable customer_id throughout the pipeline.
 */
export async function createTemporaryCustomer(uniqueSuffix?: string): Promise<Customer> {
  const suffix = uniqueSuffix || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
  const tempName = `Unknown Customer - ${suffix}`;
  return createCustomer({
    name: tempName,
    tags: ['temporary', 'auto-detected']
  });
}

export interface ExtractedCustomerInfo {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
}

export type CustomerResolutionResult =
  | { type: 'resolved'; customerId: string; customerName?: string; isNew: boolean }
  | { type: 'matched_existing'; customerId: string; customerName: string }
  | { type: 'updated_temporary'; customerId: string; customerName: string }
  | { type: 'ambiguous'; candidateIds: string[]; candidateNames?: string[]; extractedName: string }
  | { type: 'no_name' };

/** Helper to strip non-digits for phone comparisons */
function normalizeDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Update the temporary customer with extracted info, or reassociate to an existing customer
 * if a strong, deterministic match is identified.
 *
 * Rules:
 *  1. If extracted name is empty/null -> return no_name (temporary customer remains)
 *  2. Search existing NON-TEMPORARY customers for strong matches (full name, phone, email)
 *  3. If single strong match found -> reassign recording/call records to existing customer,
 *     safely delete the temporary customer, return matched_existing
 *  4. If multiple matches or single-first-name collision -> return ambiguous (do NOT guess)
 *  5. If no match -> update the existing temporary customer profile with extracted details
 *     (preserving the same customer_id!), remove temporary tag, return updated_temporary
 */
export async function resolveOrUpdateCustomer(
  tempCustomerId: string,
  extracted: ExtractedCustomerInfo,
  recordingId?: string
): Promise<CustomerResolutionResult> {
  const candidateName = extracted.name?.trim() || null;
  if (!candidateName) {
    return { type: 'no_name' };
  }

  try {
    const { data: allCustomers, error } = await (await import('../supabase/client')).supabase
      .from('customers')
      .select('*')
      .order('name');

    if (error) {
      console.error('[CustomerResolution] Failed to load customers:', error);
      return { type: 'no_name' };
    }

    // Exclude the temporary customer itself and any other temporary placeholders
    const realCustomers = (allCustomers || []).filter(
      (c) => c.id !== tempCustomerId && !isTemporaryCustomer(c)
    );

    const nameLower = candidateName.toLowerCase();

    // 1. Strong match by exact full name (case-insensitive)
    const exactNameMatches = realCustomers.filter(
      (c) => c.name.trim().toLowerCase() === nameLower
    );

    // 2. Strong match by phone number (if extracted)
    let phoneMatches: Customer[] = [];
    if (extracted.phone && extracted.phone.trim()) {
      const cleanPhone = normalizeDigits(extracted.phone);
      if (cleanPhone.length >= 7) {
        phoneMatches = realCustomers.filter(
          (c) => c.phone && normalizeDigits(c.phone) === cleanPhone
        );
      }
    }

    // 3. Strong match by email address (if extracted)
    let emailMatches: Customer[] = [];
    if (extracted.email && extracted.email.trim()) {
      const cleanEmail = extracted.email.trim().toLowerCase();
      emailMatches = realCustomers.filter(
        (c) => c.email && c.email.trim().toLowerCase() === cleanEmail
      );
    }

    // Union of strong match candidates
    const matchedCustomerMap = new Map<string, Customer>();
    for (const c of [...exactNameMatches, ...phoneMatches, ...emailMatches]) {
      matchedCustomerMap.set(c.id, c);
    }
    const matchedList = Array.from(matchedCustomerMap.values());

    // Case 1: Multiple strong matches -> Ambiguous (Never guess!)
    if (matchedList.length > 1) {
      return {
        type: 'ambiguous',
        candidateIds: matchedList.map((c) => c.id),
        candidateNames: matchedList.map((c) => c.name),
        extractedName: candidateName
      };
    }

    // Case 2: Exactly ONE strong match -> Safe match to existing customer
    if (matchedList.length === 1) {
      const existing = matchedList[0];
      const client = (await import('../supabase/client')).supabase;

      // Reassign recording to existing customer
      if (recordingId) {
        await client
          .from('meeting_recordings')
          .update({ customer_id: existing.id, updated_at: new Date().toISOString() })
          .eq('id', recordingId);

        // Reassign any calls, tasks, or deals created under tempCustomerId
        await client.from('calls').update({ customer_id: existing.id }).eq('customer_id', tempCustomerId);
        await client.from('tasks').update({ customer_id: existing.id }).eq('customer_id', tempCustomerId);
        await client.from('deals').update({ customer_id: existing.id }).eq('customer_id', tempCustomerId);
      }

      // Safely delete temporary customer profile (now that it has 0 referencing rows)
      await deleteCustomer(tempCustomerId).catch((delErr) => {
        console.warn('[CustomerResolution] Notice: Temporary customer cleanup deferred:', delErr?.message);
      });

      return {
        type: 'matched_existing',
        customerId: existing.id,
        customerName: existing.name
      };
    }

    // Case 3: First-name-only ambiguity check
    // If the candidate name has no space (e.g. "Rahul"), and multiple existing customers
    // share that first name, mark as AMBIGUOUS.
    const isSingleWord = !candidateName.includes(' ');
    if (isSingleWord) {
      const firstNameMatches = realCustomers.filter(
        (c) => c.name.trim().toLowerCase().split(/\s+/)[0] === nameLower
      );
      if (firstNameMatches.length > 1) {
        return {
          type: 'ambiguous',
          candidateIds: firstNameMatches.map((c) => c.id),
          candidateNames: firstNameMatches.map((c) => c.name),
          extractedName: candidateName
        };
      }
      if (firstNameMatches.length === 1) {
        // Exactly one customer has this first name -> safe match
        const existing = firstNameMatches[0];
        const client = (await import('../supabase/client')).supabase;
        if (recordingId) {
          await client
            .from('meeting_recordings')
            .update({ customer_id: existing.id, updated_at: new Date().toISOString() })
            .eq('id', recordingId);
          await client.from('calls').update({ customer_id: existing.id }).eq('customer_id', tempCustomerId);
          await client.from('tasks').update({ customer_id: existing.id }).eq('customer_id', tempCustomerId);
          await client.from('deals').update({ customer_id: existing.id }).eq('customer_id', tempCustomerId);
        }
        await deleteCustomer(tempCustomerId).catch(() => {});
        return {
          type: 'matched_existing',
          customerId: existing.id,
          customerName: existing.name
        };
      }
    }

    // Case 4: No existing match -> UPDATE the existing temporary customer!
    // The customer_id MUST remain the same tempCustomerId.
    // Do NOT create a second customer profile!
    const updatePayload: Partial<Omit<Customer, 'id' | 'created_at' | 'owner_id'>> = {
      name: candidateName,
      tags: [] // remove 'temporary' tag so it becomes a standard permanent customer
    };
    if (extracted.phone?.trim()) updatePayload.phone = extracted.phone.trim();
    if (extracted.email?.trim()) updatePayload.email = extracted.email.trim();
    if (extracted.company?.trim()) updatePayload.company = extracted.company.trim();

    await updateCustomer(tempCustomerId, updatePayload);

    return {
      type: 'updated_temporary',
      customerId: tempCustomerId,
      customerName: candidateName
    };

  } catch (err: any) {
    console.error('[CustomerResolution] Error resolving or updating customer:', err);
    return { type: 'no_name' };
  }
}

/**
 * Deterministically resolve a customer_id from an AI-extracted candidate name.
 * Kept for backward compatibility.
 */
export async function resolveCustomerByName(
  candidateName: string | null | undefined
): Promise<CustomerResolutionResult> {
  if (!candidateName || !candidateName.trim()) {
    return { type: 'no_name' };
  }

  const nameTrimmed = candidateName.trim();

  try {
    const { data: allCustomers, error } = await (await import('../supabase/client')).supabase
      .from('customers')
      .select('id, name')
      .order('name');

    if (error) {
      console.error('[CustomerResolution] Failed to load customers:', error);
      return { type: 'no_name' };
    }

    const customers = allCustomers || [];

    // Exact full-name match (case-insensitive)
    const exactMatches = customers.filter(
      (c) => c.name.trim().toLowerCase() === nameTrimmed.toLowerCase()
    );

    if (exactMatches.length === 1) {
      return { type: 'resolved', customerId: exactMatches[0].id, customerName: exactMatches[0].name, isNew: false };
    }

    if (exactMatches.length > 1) {
      return {
        type: 'ambiguous',
        candidateIds: exactMatches.map((c) => c.id),
        candidateNames: exactMatches.map((c) => c.name),
        extractedName: nameTrimmed
      };
    }

    // First-name-only safety check
    const firstNameOnly = !nameTrimmed.includes(' ');
    if (firstNameOnly) {
      const firstNameLower = nameTrimmed.toLowerCase();
      const firstNameMatches = customers.filter(
        (c) => c.name.trim().toLowerCase().split(' ')[0] === firstNameLower
      );
      if (firstNameMatches.length > 1) {
        return {
          type: 'ambiguous',
          candidateIds: firstNameMatches.map((c) => c.id),
          candidateNames: firstNameMatches.map((c) => c.name),
          extractedName: nameTrimmed
        };
      }
      if (firstNameMatches.length === 1) {
        return { type: 'resolved', customerId: firstNameMatches[0].id, customerName: firstNameMatches[0].name, isNew: false };
      }
    }

    // Partial match
    const partialMatches = customers.filter((c) => {
      const existingLower = c.name.trim().toLowerCase();
      const candidateLower = nameTrimmed.toLowerCase();
      return existingLower.includes(candidateLower) || candidateLower.includes(existingLower);
    });

    if (partialMatches.length === 1) {
      return { type: 'resolved', customerId: partialMatches[0].id, customerName: partialMatches[0].name, isNew: false };
    }

    if (partialMatches.length > 1) {
      return {
        type: 'ambiguous',
        candidateIds: partialMatches.map((c) => c.id),
        candidateNames: partialMatches.map((c) => c.name),
        extractedName: nameTrimmed
      };
    }

    // No match -> create new customer
    const newCustomer = await createCustomer({ name: nameTrimmed, tags: [] });
    return { type: 'resolved', customerId: newCustomer.id, customerName: newCustomer.name, isNew: true };

  } catch (err: any) {
    console.error('[CustomerResolution] Unexpected error:', err);
    return { type: 'no_name' };
  }
}

/**
 * Search customers by partial name (for extension customer search).
 * Returns up to 20 matching customers ordered by name.
 */
export async function searchCustomersByName(query: string): Promise<Customer[]> {
  if (!query.trim()) return [];
  const term = `%${query.trim()}%`;
  const { data, error } = await (await import('../supabase/client')).supabase
    .from('customers')
    .select('*')
    .ilike('name', term)
    .order('name')
    .limit(20);

  if (error) throw handleCustomerError(error, 'Customer search failed.');
  return data || [];
}
