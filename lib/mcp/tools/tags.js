// MCP tag-management tools — list/inspect the user's tags, activate an
// unactivated tag, and edit its profile. All queries scoped to ctx.user.
const { z } = require('zod');
const prisma = require('../../db');
const { formatTag } = require('../../helpers');
const tagTypes = require('../../tagTypes');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function out(obj) {
  if (typeof obj === 'string') return { content: [{ type: 'text', text: obj }] };
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }], structuredContent: obj };
}

function registerTagTools(server, ctx) {
  const user = ctx.user;

  server.registerTool('list_my_tags', {
    title: 'List my tags',
    description: "List the SafeTags registered to the current user (id, type, active, scans).",
    inputSchema: {},
  }, async () => {
    const rows = await prisma.tag.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: 'desc' } });
    const tags = rows.map((t) => {
      const d = formatTag(t);
      return { tag_id: d.tag_id, type: d.tag_type, is_active: d.is_active, scan_count: d.scan_count, scan_url: `${BASE_URL}/t/${d.tag_id}` };
    });
    return out({ tags });
  });

  server.registerTool('get_tag', {
    title: 'Get tag',
    description: "Get one of the user's tags with its profile and scan URL.",
    inputSchema: { tag_id: z.string().min(4) },
  }, async ({ tag_id }) => {
    const tag = await prisma.tag.findUnique({ where: { tagId: tag_id }, include: { profile: true, genericProfile: true } });
    if (!tag || tag.ownerId !== user.id) return out('Tag not found in your account.');
    const d = formatTag(tag, true);
    d.scan_url = `${BASE_URL}/t/${tag.tagId}`;
    if (tag.genericProfile) {
      try { d.profile = { type: tag.genericProfile.type, ...JSON.parse(tag.genericProfile.data || '{}') }; } catch (_) {}
    }
    return out(d);
  });

  server.registerTool('list_tag_types', {
    title: 'List tag types',
    description: 'List the tag types a Universal tag can be activated as (id + label).',
    inputSchema: {},
  }, async () => {
    return out({ types: tagTypes.choosableTypes().map((t) => ({ id: t.id, label: t.label })) });
  });

  server.registerTool('activate_tag', {
    title: 'Activate a tag',
    description:
      "Activate an unactivated SafeTag the user physically holds, claiming it to their account. " +
      "Provide the code and its security key (printed on the tag/manual). For a Universal tag, also pass `type`.",
    inputSchema: {
      tag_id: z.string().min(4),
      security_key: z.string().optional(),
      type: z.string().optional(),
    },
  }, async ({ tag_id, security_key, type }) => {
    const tag = await prisma.tag.findUnique({ where: { tagId: tag_id } });
    if (!tag) return out('Tag not found. Check the code printed on your SafeTag.');
    if (tag.isActive) return out(`Tag ${tag_id} is already activated.`);
    if (tag.securityKey && security_key !== tag.securityKey) return out('Security key does not match. It is printed on the tag or its manual.');
    if (tag.ownerId && tag.ownerId !== user.id) return out('This tag is already registered to another account.');

    let resolvedType = null;
    let effType = tagTypes.effectiveType(tag);
    if (tagTypes.isUniversal(tag.tagType) && !tag.resolvedType) {
      if (!type) return out('This is a Universal tag — pass `type` (e.g. medical, vcard, pet, vehicle). Call list_tag_types for options.');
      if (!tagTypes.isChoosable(type)) return out(`"${type}" is not a valid type. Call list_tag_types for the list.`);
      resolvedType = type; effType = type;
    }

    await prisma.tag.update({
      where: { tagId: tag.tagId },
      data: { ownerId: user.id, isActive: true, activatedAt: new Date(), ...(resolvedType ? { resolvedType } : {}) },
    });
    const next = tagTypes.isMedical(effType)
      ? 'Use update_medical_profile to add blood group, allergies and emergency contacts.'
      : 'Use update_tag_profile to add its details.';
    return out({ ok: true, tag_id, type: effType, scan_url: `${BASE_URL}/t/${tag_id}`, message: `Tag ${tag_id} activated as ${effType}. ${next}` });
  });

  server.registerTool('update_medical_profile', {
    title: 'Update medical profile',
    description:
      "Create or update the emergency medical profile on a medical SafeTag the user owns. " +
      "name, age and mobile_primary are required (read them with get_tag first when editing).",
    inputSchema: {
      tag_id: z.string().min(4),
      name: z.string().min(1),
      age: z.number().int().min(0).max(150),
      mobile_primary: z.string().min(6).max(20),
      blood_group: z.string().optional(),
      allergies: z.string().optional(),
      medical_conditions: z.string().optional(),
      medications: z.string().optional(),
      address: z.string().optional(),
      mobile_secondary: z.string().optional(),
      owner_whatsapp: z.string().optional(),
      email: z.string().email().optional(),
      parent_name: z.string().optional(),
      custom_message: z.string().optional(),
    },
  }, async (a) => {
    const tag = await prisma.tag.findUnique({ where: { tagId: a.tag_id } });
    if (!tag || tag.ownerId !== user.id) return out('Tag not found in your account.');
    if (!tagTypes.isMedical(tagTypes.effectiveType(tag))) return out('This tag is not a medical tag. Use update_tag_profile instead.');

    const data = {
      name: a.name, age: a.age, mobilePrimary: a.mobile_primary,
      bloodGroup: a.blood_group ?? null, allergies: a.allergies ?? null,
      medicalConditions: a.medical_conditions ?? null, medications: a.medications ?? null,
      address: a.address ?? null, mobileSecondary: a.mobile_secondary ?? null,
      ownerWhatsapp: a.owner_whatsapp ?? null, email: a.email ?? null,
      parentName: a.parent_name ?? null, customMessage: a.custom_message ?? null,
    };
    await prisma.medicalProfile.upsert({
      where: { tagId: a.tag_id },
      update: data,
      create: { tagId: a.tag_id, ...data },
    });
    return out({ ok: true, tag_id: a.tag_id, scan_url: `${BASE_URL}/t/${a.tag_id}`, message: 'Medical profile saved.' });
  });

  server.registerTool('update_tag_profile', {
    title: 'Update tag profile (non-medical)',
    description:
      "Create or update the profile of a non-medical tag (e.g. vcard, pet, vehicle, social). " +
      "Pass `fields` as an object of that type's fields. Call get_tag to see the current data and list_tag_types for types.",
    inputSchema: {
      tag_id: z.string().min(4),
      fields: z.record(z.string(), z.any()),
    },
  }, async ({ tag_id, fields }) => {
    const tag = await prisma.tag.findUnique({ where: { tagId: tag_id } });
    if (!tag || tag.ownerId !== user.id) return out('Tag not found in your account.');
    const type = tagTypes.effectiveType(tag);
    if (tagTypes.isMedical(type)) return out('This is a medical tag. Use update_medical_profile instead.');
    if (!tagTypes.getType(type)) return out(`Unknown tag type "${type}".`);

    const data = JSON.stringify(fields || {});
    await prisma.tagProfile.upsert({
      where: { tagId: tag_id },
      update: { type, data },
      create: { tagId: tag_id, type, data },
    });
    return out({ ok: true, tag_id, type, scan_url: `${BASE_URL}/t/${tag_id}`, message: `${type} profile saved.` });
  });
}

module.exports = { registerTagTools };
