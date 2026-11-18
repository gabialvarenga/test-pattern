import { User } from '../../src/domain/User.js';

/**
 * Object Mother: fábrica de usuários "prontos" e fixos.
 * Usuários raramente mudam entre os testes (só o tipo), então métodos
 * estáticos nomeados são mais expressivos do que um builder.
 */
export class UserMother {
    static umUsuarioPadrao() {
        return new User(1, 'Usuário Padrão', 'padrao@email.com', 'PADRAO');
    }

    static umUsuarioPremium() {
        return new User(2, 'Usuário Premium', 'premium@email.com', 'PREMIUM');
    }
}
