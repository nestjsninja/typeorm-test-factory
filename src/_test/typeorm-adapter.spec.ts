import { typeormPersister, RepositoryProvider } from '../adapters/typeorm';

class Thing {
  id?: number;
  name!: string;
}

describe('typeormPersister', () => {
  it('saves via getRepository(target).save(entity) and returns the result', async () => {
    const saved = { id: 1, name: 'a' };
    const repo = { save: jest.fn().mockResolvedValue(saved) };
    const source: RepositoryProvider = {
      getRepository: jest.fn().mockReturnValue(repo),
    };

    const persister = typeormPersister(source);
    const result = await persister.save(Thing, { name: 'a' });

    expect(source.getRepository).toHaveBeenCalledWith(Thing);
    expect(repo.save).toHaveBeenCalledWith({ name: 'a' });
    expect(result).toBe(saved);
  });

  it('accepts any object with a structural getRepository (DataSource / EntityManager / Connection)', async () => {
    // Simulates the shape all three TypeORM objects share, without importing typeorm.
    const dataSourceLike = {
      getRepository: () => ({ save: async (e: any) => ({ ...e, id: 7 }) }),
    };

    const persister = typeormPersister(dataSourceLike);
    const result = await persister.save<{ id: number }>(Thing, { name: 'b' });

    expect(result.id).toBe(7);
  });
});
