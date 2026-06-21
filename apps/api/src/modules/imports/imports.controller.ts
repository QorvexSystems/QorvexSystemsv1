import { Controller, Get, UseGuards } from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { ImportsService } from './imports.service';

@Controller('imports')
@UseGuards(JwtAuthGuard, TenantMembershipGuard)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.importsService.findAll(tenantId);
  }
}
