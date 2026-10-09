/**
 * The permissions an admin can grant, with names a person recognises.
 *
 * The raw codes are what the API speaks; nobody managing a team should
 * have to know that "CHAT_TEMPLATE" is the thing that lets someone message
 * a customer whose 24-hour window has closed. Grouped, because the list is
 * eleven items long and reads as noise ungrouped.
 */
export interface PermissionOption {
  value: string;
  label: string;
  hint?: string;
}

export interface PermissionGroup {
  title: string;
  items: PermissionOption[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Chats',
    items: [
      { value: 'CHAT_READ', label: 'Read chats' },
      { value: 'CHAT_SEND', label: 'Send messages' },
      { value: 'CHAT_MEDIA', label: 'Send photos and files' },
      {
        value: 'CHAT_TEMPLATE',
        label: 'Send templates',
        hint: 'The only way to reach a customer after 24 hours of silence',
      },
      { value: 'CHAT_REACTION', label: 'React to messages' },
      { value: 'CHAT_PIN', label: 'Pin chats' },
    ],
  },
  {
    title: 'Calls',
    items: [
      { value: 'CALL_ACCESS', label: 'Make and take calls' },
      { value: 'CALL_HISTORY', label: 'See call history' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { value: 'ANALYTICS_VIEW', label: 'See analytics' },
      { value: 'PROFILE_VIEW', label: 'View the business profile' },
      { value: 'PROFILE_EDIT', label: 'Edit the business profile' },
    ],
  },
];

/** What a new member gets unless the admin says otherwise: enough to do the job. */
export const DEFAULT_PERMISSIONS = [
  'CHAT_READ',
  'CHAT_SEND',
  'CHAT_MEDIA',
  'CHAT_REACTION',
  'CALL_ACCESS',
  'PROFILE_VIEW',
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.value));
