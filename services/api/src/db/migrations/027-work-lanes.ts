// A project's work lanes (the preset and the names of the Plant's six work bays) are a setting its
// administrator may change, like its default workflow. Additive: a project without them reads as the
// capital-project preset, which is the six bays as they were drawn before lanes existed.
export const WORK_LANES_SQL = `
insert into lifecycle_mutable values ('projects', 'work_lanes');
`;

/** Reverses 027 for the migration preservation tests. */
export const WORK_LANES_DOWN_SQL = `
delete from lifecycle_mutable where table_name = 'projects' and field = 'work_lanes';
delete from schema_migrations where version = '027-work-lanes';
`;
