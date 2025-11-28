import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

// In-memory user store (will be replaced with database in Day 10)
interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  private users: User[] = [];

  constructor(private jwtService: JwtService) {}

  async register(registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = this.users.find((u) => u.email === registerDto.email);

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Create new user
    const newUser: User = {
      id: Date.now().toString(),
      name: registerDto.name,
      email: registerDto.email,
      password: hashedPassword,
      createdAt: new Date(),
    };

    this.users.push(newUser);

    // Generate JWT token
    const token = this.generateToken(newUser);

    return {
      access_token: token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
      },
    };
  }

  async login(loginDto: LoginDto) {
    // Find user by email
    const user = this.users.find((u) => u.email === loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT token
    const token = this.generateToken(user);

    return {
      access_token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    };
  }

  async validateUser(userId: string) {
    const user = this.users.find((u) => u.id === userId);

    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
  }

  private generateToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    return this.jwtService.sign(payload);
  }
}
