export const NODE_PREFIX = {
  project: 'P',
  epic: 'E',
  feature: 'F',
  story: 'S',
  task: 'T'
};

export const PARENT_TYPE = {
  project: null,
  epic: 'project',
  feature: 'epic',
  story: 'feature',
  task: 'story'
};

export const NODE_TYPES = Object.freeze(Object.keys(NODE_PREFIX));
export const NODE_STATUS = Object.freeze([
  'idea', 'exploring', 'specified', 'planned',
  'implementing', 'verifying', 'done'
]);

export function allowedParentType(type) {
  return PARENT_TYPE[type];
}
