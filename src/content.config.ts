import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const common = {
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  sample: z.boolean().default(false),
};

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({ ...common, category: z.string().default('学习记录') }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    ...common,
    status: z.enum(['计划中', '进行中', '已完成']).default('计划中'),
    accent: z.enum(['purple', 'lime', 'orange']).default('purple'),
    diagram: z.enum(['wave', 'board', 'circuit']).default('board'),
    repository: z.url({ protocol: /^https?$/ }).optional(),
    demo: z.url({ protocol: /^https?$/ }).optional(),
  }),
});

const experiments = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/experiments' }),
  schema: z.object({
    ...common,
    order: z.number().default(999),
    stage: z.enum(['前置', '基础', '进阶']).default('基础'),
    status: z.enum(['计划中', '进行中', '已完成']).default('计划中'),
    board: z.string().default('Zynq-7035 核心板 + 自制 AD/DA 底板'),
    tools: z.array(z.string()).default([]),
    accent: z.enum(['purple', 'lime', 'orange']).default('purple'),
    diagram: z.enum(['wave', 'board', 'circuit']).default('wave'),
  }),
});

export const collections = { notes, projects, experiments };